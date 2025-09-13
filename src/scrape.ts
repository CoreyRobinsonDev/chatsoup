import { Browser, executablePath, Page, type LaunchOptions } from "puppeteer";
import stealthPlugin from "puppeteer-extra-plugin-stealth"
import puppeteer from "puppeteer-extra"
import { Platform, type Chat } from "./types";
import path from "path";
import { emojis, type Emojis } from "@coreyrobinsondev/emoji"


const MAX_TIMEOUT: number = 30_000
const extension = `${path.join(process.cwd(), "assets/extensions/7tv")}`
const CONFIG: LaunchOptions = {
	args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox",
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`
    ],
	defaultViewport: { width: 1980, height: 1024 },
	slowMo: 50, 
	executablePath: executablePath(),
	headless: true 
}

export async function getProfile(platform: Platform, streamer: string, page: Page): Promise<string> {
    let profile = ""

    switch(platform) {
    case Platform.KICK:
        profile =  await page.$eval("img#channel-avatar", avatar => avatar.getAttribute("src") ?? "")
        break
    case Platform.TWITCH:
        profile = await page.$eval("div[aria-label=\"Channel Avatar Picture\"] img.tw-image.tw-image-avatar", avatar => avatar.getAttribute("src") ?? "") 
        break
    case Platform.TWITTER:
    case Platform.YOUTUBE:
    }

    await page.close()
    return profile
}

export async function kick(page: Page): Promise<Chat[]> {
    const chat  = await page.$$eval("div.chat-entry > div", chats => {
        return chats.map(el => {
            const badgeImg = el.querySelector("img.icon")?.getAttribute("src")
            const badgeName = el.querySelector("img.icon")?.getAttribute("alt")
            const userName = el.querySelector(".chat-entry-username")?.textContent
            const userColor = el.querySelector(".chat-entry-username")?.getAttribute("style")
                ?.split("(").at(-1)
                ?.split(",")
                .slice(0, 3)
                .map((el, idx) => {
                    if (idx === 2) {
                        return Number(el.trim().split(")")[0])
                    }
                    return Number(el.trim())
                })
            const contentHTML = el.querySelector(".font-bold.text-white + span")?.children
            let content = ""
            let emoteContainer: Chat["emoteContainer"] = {}
            for (let i = 0; i < (contentHTML?.length ?? 0); i++) {
                const className = contentHTML?.item(i)?.querySelector(".chat-emote-container, .chat-entry-content")?.className
                if (className === "chat-emote-container") {
                    const emoteName = contentHTML?.item(i)?.querySelector(".chat-emote-container > div > img")?.getAttribute("alt")
                    const emoteSrc = contentHTML?.item(i)?.querySelector(".chat-emote-container > div > img")?.getAttribute("src")
                    if (content.length > 0) {
                        content += " " + emoteName
                    } else { content += emoteName }
                    if (typeof emoteName === "string") {
                        emoteContainer[emoteName] = emoteSrc ?? "ERR"
                    }
                } else if (className === "chat-entry-content") {
                    if (content.length > 0) {
                        content += " " + contentHTML?.item(i)?.querySelector(".chat-entry-content")?.textContent
                    } else {
                        content += contentHTML?.item(i)?.querySelector(".chat-entry-content")?.textContent
                    }
                }
            }


            return {
                badgeName: badgeName ? badgeName : undefined,
                badgeImg: badgeImg ? badgeImg : undefined,
                userName: userName ? userName : "ERR",
                userColor: userColor ? userColor : [0,0,0],
                content,
                emoteContainer: Object.keys(emoteContainer).length > 0 ? emoteContainer : undefined
            }
        })
    }) ?? []

	return chat
        .reverse()
        .filter(el => el.userName !== "ERR" || el.content.length !== 0)
        .map(el => {
            if (!el.emoteContainer) return el
            
            for (const key of Object.keys(el.emoteContainer)) {
                el.emoteContainer[key] = emojis[key as keyof Emojis] ? emojis[key as keyof Emojis].emojiBlob : el.emoteContainer[key]
            }

            return el
        })
}

export async function twitch(page: Page): Promise<Chat[]> {
    const chat = await page.$$eval("main.seventv-chat-list > div", chats => {
        return chats.map(el => {
			const badgeImg = el.querySelector(".seventv-chat-badge > img")?.getAttribute("srcset")?.split(", ").at(-1)?.slice(0, -3)
			const badgeName = el.querySelector(".seventv-chat-badge > img")?.getAttribute("alt")
			const userName = el.querySelector(".seventv-chat-user-username")?.textContent
			const userColor = el.querySelector(".seventv-chat-user")?.getAttribute("style")
				?.split("(").at(-1)
				?.split(",")
				.slice(0, 3)
				.map((el, idx) => {
					if (idx === 2) {
						return Number(el.trim().split(")")[0])
					}
					return Number(el.trim())
				})
			const contentHTML = el.querySelectorAll(".text-token, .emote-token, .mention-token")
            let content = ""
			let emoteContainer: Chat["emoteContainer"] = {}
			for (let i = 0; i < (contentHTML?.length ?? 0); i++) {
				if (contentHTML.item(i).children.length !== 0) {
					let emoteSrc = contentHTML.item(i).firstElementChild?.getAttribute("srcset")
                        ?.split(",").at(-1)?.split(" ")[1]
					const emoteName = contentHTML.item(i).firstElementChild?.getAttribute("alt")

					if (content.length > 0) {
						content += " " + emoteName
					} else { content += emoteName }
					if (typeof emoteName === "string") {
						emoteContainer[emoteName] = emoteSrc ? "https:" + emoteSrc : "ERR"
					}
				} else if (contentHTML.item(i).className.includes("text-token") 
                    || contentHTML.item(i).className.includes("mention-token") 
                ) {
					if (content.length > 0) {
						content += " " + contentHTML.item(i).textContent
					} else {
						content += contentHTML.item(i).textContent
					}
				}
			}

			return {
				badgeName: badgeName ? badgeName : undefined,
				badgeImg: badgeImg ? badgeImg : undefined,
				userName: userName ? userName : "ERR",
				userColor: userColor ? userColor : [0,0,0],
                // removing double spacing around emotes
				content: content.split("  ").join(" ").trim(),
				emoteContainer: Object.keys(emoteContainer).length > 0 ? emoteContainer : undefined
			}
        })
    }) ?? []
	return chat
        .reverse()
        .filter(el => el.userName !== "ERR" || el.content.length !== 0)
        .map(el => {
            if (!el.emoteContainer) return el
            
            for (const key of Object.keys(el.emoteContainer)) {
                el.emoteContainer[key] = emojis[key as keyof Emojis] ? emojis[key as keyof Emojis].emojiBlob : el.emoteContainer[key]
            }

            return el
        })
}

export async function twitter(page: Page): Promise<Chat[]> {
    return []
}

export async function youtube(page: Page): Promise<Chat[]> {
    return []
}


export async function getChat(platform: Platform, page: Page): Promise<Chat[]> {
    switch(platform) {
    case Platform.TWITCH: return twitch(page)
    case Platform.KICK: return kick(page)
    case Platform.TWITTER: return twitter(page)
    case Platform.YOUTUBE: return youtube(page)
    }
}

export async function initBrowser(): Promise<Browser> {
	puppeteer.use(stealthPlugin())
    return await puppeteer.launch(CONFIG)
}


export async function goto(browser: Browser, site: string): Promise<Page> {
	const page = await browser.newPage()
	page.setDefaultTimeout(MAX_TIMEOUT)

    await page.goto(site, { waitUntil: "networkidle2" })
    return page
}



