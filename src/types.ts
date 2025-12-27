export type Success<T> = [ T, undefined ] 
export type Failure<E> = [ undefined, E ]
export type Result<T, E = Error> = Success<T> | Failure<E>
export type Option<T> = T | undefined

export type WebSocketData = {
	payload: Payload[]
	clientId: string
}

export type Payload = {
	platform: Platform
	streamer: string
}

export type Badge = {
	name: string
	img: string
}

export type Chat = {
	badges?: Badge[]
	userName: string
	userColor: number[]
	content: string
	emoteContainer?: {[U: string]: string}
}


export type Platform = "KICK" | "TWITCH" | "TWITTER" | "YOUTUBE"


