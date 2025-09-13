import { getChat, getProfile, goto, initBrowser } from "./scrape.ts";
import { log, Resp, tryCatch, unwrap } from "./util.ts";
import { type WebSocketData, type Platform } from "./types.ts";
import index from "./frontend/index.html" 
import type { RouterTypes } from "bun";

export const SocketCode = {
	MessageProhibited: 4000,
	BadRequest: 4001,
	Unauthorized: 4002,
	InternalServerError: 1011
}

export const BROWSER = unwrap(await tryCatch(initBrowser()))

type Routes = {
    "/": RouterTypes.RouteValue<"/">
    "/*": RouterTypes.RouteValue<"/*">
    "/health": RouterTypes.RouteValue<"/health">
    "/health/downstream": RouterTypes.RouteValue<"/health/downstream">
    "/api/:platform/:streamer/chat": RouterTypes.RouteValue<"/api/:platform/:streamer/chat">
    "/api/:platform/:streamer/profile": RouterTypes.RouteValue<"/api/:platform/:streamer/profile">
}

const s = Bun.serve<WebSocketData, Routes>({
    idleTimeout: 60,
	routes: {
		"/": index,
        "/*": Resp.NotFound(),
        "/health": Resp.Ok("Up"),
        "/health/downstream": async () => {
            const kickRes = await fetch("https://kick.com")
            const twitchRes = await fetch("https://twitch.tv")

            return Response.json({
                status: 200,
                message: "Up",
                downstream: {
                    twitch: twitchRes.ok ? "Up" : "Down",
                    kick: kickRes.ok ? "Up" : "Down",
                }
            }, { status: 200 })
        },
        "/api/:platform/:streamer/profile": async req => {
            let {platform, streamer} = req.params
            platform = platform.toUpperCase() as Platform
            streamer = streamer.toLowerCase()

			if (!streamer) {
				return Resp.BadRequest(`No Streamer Provided`)
			} else if (
				platform !== "KICK" &&
				platform !== "TWITCH" &&
				platform !== "TWITTER" &&
				platform !== "YOUTUBE" 
			) {
				return Resp.BadRequest(`Invalid Plaform: ${platform}`)
			}

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
                log.error(pageErr)
                return Resp.BadRequest(`Error on visiting ${site}`)
            }

            const [profileUrl, profileUrlErr] = await tryCatch(getProfile(platform as Platform, page))
            if (!profileUrl) {
                log.error(profileUrlErr)
                return Resp.BadRequest(`Error on fetching ${site} profile`)
            }

            return Resp.Ok(profileUrl)
        },
        "/api/:platform/:streamer/chat": async (req, server) => {
            const {platform, streamer} = req.params
			const ip = server.requestIP(req)

			if (!streamer) {
				return Resp.BadRequest(`No Streamer Provided`)
			} else if (
				platform !== "KICK" &&
				platform !== "TWITCH" &&
				platform !== "TWITTER" &&
				platform !== "YOUTUBE" 
			) {
				return Resp.BadRequest(`Invalid Plaform: ${platform}`)
			}

            if (!s.upgrade(req, {
                data: {
                    streamer: streamer.toLowerCase(), 
                    platform: platform.toUpperCase() as Platform,
                    clientId: btoa(`${ip?.address}:${ip?.port}`)
                },
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
			const streamer = ws.data.streamer
			const platform = ws.data.platform
            log.debug(`[${clientId}] has connected`)


            log.debug(`[${clientId}] /${platform}/${streamer}`)
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
                log.debug(`[${clientId}] has disconnected`)
                log.debug(`\t[${clientId}] Call to ${platform} is unimplemented`)
			}

            const [page, pageErr] = await tryCatch(goto(BROWSER, site))
            let lastUsername = "" 
            let lastContent = ""
            let emptyResponses = 0
            const emptyRepsonseLimit = 500

            if (!page) {
                ws.unsubscribe(platform+streamer)
                ws.close(SocketCode.InternalServerError, `Error on visiting ${site}`)
                log.debug(`[${clientId}] has disconnected`)
                log.error(`\tError on visiting ${site}`)
                log.error(`\t${pageErr}`)
                return
            }

            while (s.subscriberCount(platform+streamer) > 0) {
                const [chat, chatErr] = await tryCatch(getChat(platform, page))

                if (!chat) {
                    ws.unsubscribe(platform+streamer)
                    ws.close(SocketCode.InternalServerError, `Error on scraping ${site}`)
                    await page.close()
                    log.debug(`[${clientId}] has disconnected`)
                    log.error(`\t[${clientId}] Error on scraping ${site}`)
                    log.error(`\t${chatErr}`)
                    return
                }

                if (chat.length === 0) {
					// NOTE: ignore for now since twitch chat takes too long to load meaningful data
					continue
                    // log.debug(`[${clientId}] has disconnected`)
                    // log.debug(`\t[${clientId}] ${platform} streamer ${streamer} is offline`)
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
                            log.debug(`[${clientId}] has disconnected`)
                            log.debug(`\t${platform} streamer ${streamer} is offline`)
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
                            log.debug(`[${clientId}] has disconnected`)
                            log.debug(`\t${platform} streamer ${streamer} is offline`)
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
			ws.unsubscribe(ws.data.platform+ws.data.streamer)
            log.debug(`[${ws.data.clientId}] has exited`)
		}
	}
})



// shutdown on ctrl-c
process.on("SIGINT", async () => {
	await BROWSER.close()
})

log.info(`Listening on ${s.url}`)
