import type { Failure, Result, Success } from "./types"

export const Resp = {
	Ok(msg?: string): Response {
		return new Response(
			JSON.stringify({
				status: 200,
				message: msg ?? "Ok",
			}), 
			{status: 200}
		)
	},
	BadRequest(msg?: string): Response {
		return new Response(
			JSON.stringify({
				status: 400,
				message: msg ?? "Bad Request",
			}), 
			{status: 400}
		)
	},
    Unauthorized(msg?: string): Response {
		return new Response(
			JSON.stringify({
				status: 401,
				message: msg ?? "Unauthenticated",
			}), 
			{status: 401}
		)
    },
	NotFound(msg?: string): Response {
		return new Response(
			JSON.stringify({
				status: 404,
				message: msg ?? "Not Found",
			}), 
			{status: 404}
		)
	},
	MethodNotAllowed(msg?: string): Response {
		return new Response(
			JSON.stringify({
				status: 405,
				message: msg ?? "Method Not Allowed",
			}), 
			{status: 405}
		)
	},
	InternalServerError(msg?: string): Response {
		return new Response(
			JSON.stringify({
				status: 500,
				message: msg ?? "Internal Server Error",
			}), 
			{status: 500}
		)
	}
}

export const log = {
    info: (msg: any) => {
        const date = new Date()
        const hour = ('0'+date.getHours()).slice(-2)
        const min = ('0'+date.getMinutes()).slice(-2)
        const sec = ('0'+date.getSeconds()).slice(-2)
        const mon = ('0'+date.getMonth()).slice(-2)
        const day = ('0'+date.getDate()).slice(-2)

        if (typeof msg === "string") {
            const lines = msg.split("\n")

            for (const line of lines) {
                console.log(`\x1b[90m[${date.getFullYear()}/${mon}/${day} ${hour}:${min}:${sec}]\x1b[0m \x1b[34mINF\x1b[0m :`, line)
            }
        } else {
            console.log(`\x1b[90m[${date.getFullYear()}/${mon}/${day} ${hour}:${min}:${sec}]\x1b[0m \x1b[34mINF\x1b[0m :`, msg)
        }
        

    },
    debug: (msg: any) => {
        const date = new Date()
        const hour = ('0'+date.getHours()).slice(-2)
        const min = ('0'+date.getMinutes()).slice(-2)
        const sec = ('0'+date.getSeconds()).slice(-2)
        const mon = ('0'+date.getMonth()).slice(-2)
        const day = ('0'+date.getDate()).slice(-2)

        if (typeof msg === "string") {
            const lines = msg.split("\n")

            for (const line of lines) {
                console.log(`\x1b[90m[${date.getFullYear()}/${mon}/${day} ${hour}:${min}:${sec}]\x1b[0m \x1b[33mDBG\x1b[0m :`, line)
            }
        } else {
            console.log(`\x1b[90m[${date.getFullYear()}/${mon}/${day} ${hour}:${min}:${sec}]\x1b[0m \x1b[33mDBG\x1b[0m :`, msg)
        }
    },
    error: (msg: any) => {
        const date = new Date()
        const hour = ('0'+date.getHours()).slice(-2)
        const min = ('0'+date.getMinutes()).slice(-2)
        const sec = ('0'+date.getSeconds()).slice(-2)
        const mon = ('0'+date.getMonth()).slice(-2)
        const day = ('0'+date.getDate()).slice(-2)

        if (typeof msg === "string") {
            const lines = msg.split("\n")

            for (const line of lines) {
                console.log(`\x1b[90m[${date.getFullYear()}/${mon}/${day} ${hour}:${min}:${sec}]\x1b[0m \x1b[31mERR\x1b[0m :`, line)
            }
        } else {
            console.log(`\x1b[90m[${date.getFullYear()}/${mon}/${day} ${hour}:${min}:${sec}]\x1b[0m \x1b[31mERR\x1b[0m :`, msg)
        }
    },
}

export async function tryCatch<T, E = Error>(
    promise: Promise<T>
): Promise<Result<T, E>> {
    try {
        const data = await promise
        return [ data, undefined ]
    } catch (error) {
        return [ undefined, error as E ]
    }
}

export function unwrap<T>(result: Result<T, Error>): T {
    const [data, err] = result

    if (!data && err) {
        log.error(err.message)
        process.exit(1)
    }
    return data!
}

export function unwrapOr<T>(result: Result<T, Error>, substitute: T):  T {
    const [data, err] = result

    if (!data && err) {
        return substitute
    }
    return data!
}

export function unwrapOrElse<T>(result: Result<T, Error>, fn: () => T): T {
    const [data, err] = result

    if (!data && err) {
        return fn()
    }
    return data!
}


export function Ok<T>(data: T): Success<T> {
    return [ data, undefined ]
}

export function Err(error: Error): Failure<Error> {
    return [  undefined, error ]
}

export class Node<T> {
    value: T | undefined
    next: Node<T> | undefined

    constructor(value: T) {
        this.value = value
    }

    toString(): string {
        return `Node{value:${this.value}, next:${this.next}}`
    }
}

export class LinkedList<T> {
    #head: Node<T> | undefined
    #tail: Node<T> | undefined

    addFront(node: Node<T>) {
        if (this.#head) {
            this.#head.next = node
            this.#head = node
        } else {
            this.#head = node
            this.#tail = node
        }
    }

    addBack(node: Node<T>) {
        if (this.#tail) {
            node.next = this.#tail  
        } else {
            this.#head = node
            this.#tail = node
        }
    }

    removeFront(): Result<Node<T>> {
        if (!this.#head) return Err(new Error("LinkedList.removeFront call on headless list"))
        if (!this.#tail) return Err(new Error("LinkedList.removeFront call on tailless list with a head, somehow"))
        if (this.#head === this.#tail) {
            let head = this.#head
            this.#head = undefined
            this.#tail = undefined

            return Ok(head)
        }

        let node = this.#tail
        let head = this.#head
        this.#head = undefined

        while (node.next) {
            if (node.next === head) {
                node.next = undefined
                this.#head = node
                break
            }
            node = node.next
        }
        
        return Ok(head)
    }

    removeBack(): Result<Node<T>> {
        if (!this.#head) return Err(new Error("LinkedList.removeBack call on headless list"))
        if (!this.#tail) return Err(new Error("LinkedList.removeBack call on tailless list with a head, somehow"))
        if (this.#head === this.#tail) {
            let tail = this.#tail
            this.#head = undefined
            this.#tail = undefined

            return Ok(tail)
        }
        let tail = this.#tail
        this.#tail = tail.next

        return Ok(tail)
    }

    toString(): string {
        return `LinkedList{head:${this.#head}, tail:${this.#tail}}`
    }

}














