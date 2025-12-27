import { getProfile, goto } from "./scrape";
import type { Platform } from "./types";
import { BROWSER, tryCatch } from "./util";

// prevents TS errors
declare var self: Worker;

self.onmessage = async (event: MessageEvent) => {
	const site = event.data.site
	const platform = event.data.platform


	postMessage({ url: profileUrl })
	await BROWSER.close()
}
