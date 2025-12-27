import { getChat, getProfile, goto, initBrowser } from "./scrape.ts";
import { Resp, tryCatch, unwrap } from "./util.ts";
import { type WebSocketData, type Platform, type Payload } from "./types.ts";
import { sql, type RouterTypes } from "bun";

export const SocketCode = {
	MessageProhibited: 4000,
	BadRequest: 4001,
	Unauthorized: 4002,
	InternalServerError: 1011
}

export const BROWSER = unwrap(await tryCatch(initBrowser()))

type Routes = {
    "/health": RouterTypes.RouteValue<"/health">
    "/health/downstream": RouterTypes.RouteValue<"/health/downstream">
    "/chat": RouterTypes.RouteValue<"/chat">
    "/profile": RouterTypes.RouteValue<"/profile">
}

const s = Bun.serve<WebSocketData, Routes>({
    idleTimeout: 60,
	routes: {
        "/health": (req, server) => {
			const ip = server.requestIP(req)

			console.log(`/health: ${btoa(ip!.address)}`)

			return Resp.Ok("Up")
		},
        "/health/downstream": async (req, server) => {
            const kickRes = await fetch("https://kick.com")
            const twitchRes = await fetch("https://twitch.tv")
			const ip = server.requestIP(req)

			console.log(`/health/downstream: ${btoa(ip!.address)}`)

            return Response.json({
                status: 200,
                message: "Up",
                downstream: {
                    twitch: twitchRes.ok ? "Up" : "Down",
                    kick: kickRes.ok ? "Up" : "Down",
                }
            }, { status: 200 })
        },
        "/profile": async (req, server) => {
			const ip = server.requestIP(req)?.address ?? "IP_UNDEFINED"
			const url = new URL(req.url)
			const params = url.searchParams
			const payloadString = params.get("payload")
			if (!payloadString) { return Resp.BadRequest("Empty Payload") }
			const payload: Payload[] = payloadString.split(",").map((val) => {
				const arr = val.split("-")

				return {
					platform: arr[0]?.toUpperCase() as Platform ?? "KICK",
					streamer: arr[1]?.toLowerCase() as string ?? "ERR"
				}
			})
			const profileUrls: string[] = []

			for (const {platform, streamer} of payload) {
				if (!streamer) {
					return Resp.BadRequest(`No Streamer Provided for ${platform}`)
				} else if (
					platform !== "KICK" &&
					platform !== "TWITCH" &&
					platform !== "TWITTER" &&
					platform !== "YOUTUBE" 
				) { return Resp.BadRequest(`Invalid Plaform: ${platform}`) }

				if (streamer === "ERR") { return Resp.BadRequest("Error parcing streamer") }
				const url = await sql`SELECT url FROM profiles
					WHERE streamer = ${streamer}
					AND platform = ${platform};`

				console.log(url[0].url)
				return Resp.Ok()

				let site = ""
				switch (platform) {
				case "TWITCH":
					 site = `https://twitch.tv/${streamer}`
					break
				case "KICK":
					 site = `https://kick.com/${streamer}`
					break
				default:
					return Resp.BadRequest(`Call to ${platform} is unimplemented`)
				}

				const [page, pageErr] = await tryCatch(goto(BROWSER, site))
				if (!page) {
					console.error(pageErr)
					return Resp.InternalServerError(`Error on visiting ${site}`)
				}

				const [profileUrl, profileUrlErr] = await tryCatch(getProfile(platform as Platform, page))
				if (!profileUrl) {
					console.error(profileUrlErr)
					return Resp.InternalServerError(`Error on fetching ${site} profile`)
				}

				profileUrls.push(profileUrl)
				await sql`INSERT INTO profiles
					(streamer, platform, url)
					VALUES (${streamer}, ${platform}, ${profileUrl});`
			}

			return Resp.Ok(profileUrls)
        },
		// /chat?payload=kick-xqc,twitch-xqc
        "/chat": async (req, server) => {
			const url = new URL(req.url)
			const params = url.searchParams
			const payloadString = params.get("payload")

			if (!payloadString) { return Resp.BadRequest("Empty Payload") }
			const payload: Payload[] = payloadString.split(",").map((val) => {
				const arr = val.split("-")

				return {
					platform: arr[0] as Platform ?? "KICK",
					streamer: arr[1] as string ?? "ERR"
				}
			})

			const ip = server.requestIP(req)

			if (!s.upgrade(req, {
				data: { payload, clientId: btoa(ip!.address) }
			})) {
				return Resp.InternalServerError("Upgrade failed")
			}
			return Resp.Ok()
        }
	},
	websocket: {
		perMessageDeflate: true,
		message(ws) {
			ws.close(SocketCode.MessageProhibited, "Message Prohibited")	
		},
		async open(ws) {
			const clientId = ws.data.clientId
			const payload = ws.data.payload
            let {platform, streamer} = payload[0]!

			if (!platform) { 
                ws.close(SocketCode.BadRequest, `Invalid Plaform: ${platform}`)
                console.log(`[${clientId}] has disconnected`)
                console.log(`Invalid Plaform: ${platform}`)
			}
			if (!streamer || streamer === "ERR") { 
                ws.close(SocketCode.BadRequest, `Invalid Streamer: ${streamer}`)
                console.log(`[${clientId}] has disconnected`)
                console.log(`Invalid Streamer: ${streamer}`)
			}
			
			platform = platform.toUpperCase().trim() as Platform
			streamer = streamer.toLowerCase().trim()

			 if (
				platform !== "KICK" &&
				platform !== "TWITCH" &&
				platform !== "TWITTER" &&
				platform !== "YOUTUBE" 
			) {
                ws.close(SocketCode.BadRequest, `Invalid Plaform: ${platform}`)
                console.log(`[${clientId}] has disconnected`)
                console.log(`Invalid Plaform: ${platform}`)
			}
            console.log(`[${clientId}] has connected`)


            console.log(`[${clientId}] /${platform}/${streamer}`)
			ws.subscribe(platform+streamer)
			if (s.subscriberCount(platform+streamer) > 1) return

            let site = ""
			switch (platform) {
            case "TWITCH":
                site = `https://twitch.tv/popout/${streamer}/chat`
                break
			case "KICK":
                site = `https://kick.com/${streamer}/chatroom`
                break
            default:
                ws.unsubscribe(platform+streamer)
                ws.close(SocketCode.InternalServerError, `Call to ${platform} is unimplemented`)
                console.log(`[${clientId}] has disconnected`)
                console.log(`\t[${clientId}] Call to ${platform} is unimplemented`)
			}

            const [page, pageErr] = await tryCatch(goto(BROWSER, site))
            let lastUsername = "" 
            let lastContent = ""
            let emptyResponses = 0
            const emptyRepsonseLimit = 500

            if (!page) {
                ws.unsubscribe(platform+streamer)
                ws.close(SocketCode.InternalServerError, `Error on visiting ${site}`)
                console.log(`[${clientId}] has disconnected`)
                console.error(`\tError on visiting ${site}`)
                console.error(`\t${pageErr}`)
                return
            }

            while (s.subscriberCount(platform+streamer) > 0) {
                const [chat, chatErr] = await tryCatch(getChat(platform, page))

                if (!chat) {
                    ws.unsubscribe(platform+streamer)
                    ws.close(SocketCode.InternalServerError, `Error on scraping ${site}`)
                    await page.close()
                    console.log(`[${clientId}] has disconnected`)
                    console.error(`\t[${clientId}] Error on scraping ${site}`)
                    console.error(`\t${chatErr}`)
                    return
                }

                if (chat.length === 0) {
					// NOTE: ignore for now since twitch chat takes too long to load meaningful data
                    console.log(`[${clientId}] no chat fetched...`)
					continue
                    // console.log(`[${clientId}] has disconnected`)
                    // console.log(`\t[${clientId}] ${platform} streamer ${streamer} is offline`)
                    // ws.unsubscribe(platform+streamer)
                    // ws.close(SocketCode.BadRequest, `${platform.toLowerCase()} streamer ${streamer.toLowerCase()} is offline`)
                    // await page.close()
                    // return
                }

                const idx = chat.findIndex(el => el.userName === lastUsername && el.content === lastContent)
                if (idx === -1) {
                    if (chat.length === 0) {
                        emptyResponses++
                        if (emptyResponses >= emptyRepsonseLimit) {
                            console.log(`[${clientId}] has disconnected`)
                            console.log(`\t${platform} streamer ${streamer} is offline`)
                            ws.unsubscribe(platform+streamer)
                            ws.close(SocketCode.BadRequest, `${platform.toLowerCase()} streamer ${streamer} is offline`)
                            await page.close()
                            return
                        }
                        continue 
                    }
                    emptyResponses = 0
                    s.publish(platform+streamer, JSON.stringify(chat), true)
                } else {
                    if (chat.slice(0, idx).length === 0) {
                        emptyResponses++
                        if (emptyResponses >= emptyRepsonseLimit) {
                            console.log(`[${clientId}] has disconnected`)
                            console.log(`\t${platform} streamer ${streamer} is offline`)
                            ws.close(SocketCode.BadRequest, `${platform.toLowerCase()} streamer ${streamer} is offline`)
                            await page.close()
                            return
                        }
                        continue 
                    }
                    emptyResponses = 0
                    s.publish(platform+streamer, JSON.stringify(chat.slice(0, idx)), true)
                }
                lastUsername = chat[0]!.userName
                lastContent = chat[0]!.content
                await Bun.sleep(100)
            }
            await page.close()
		},
		async close(ws) {
			for (const pair of ws.data.payload) {
				const {platform, streamer} = pair
				ws.unsubscribe(platform+streamer)
			}
            console.log(`[${ws.data.clientId}] has exited`)
		}
	}
})



// shutdown on ctrl-c
process.on("SIGINT", async () => {
	await BROWSER.close()
})

console.log(`Listening on ${s.url}`)
