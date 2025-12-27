import type { Failure, Result, Success } from "./types"

export const Resp = {
	Ok(msg?: any): Response {
		return new Response(
			JSON.stringify({
				status: 200,
				message: msg ?? "Ok",
			}), 
			{status: 200}
		)
	},
	BadRequest(msg?: any): Response {
		return new Response(
			JSON.stringify({
				status: 400,
				message: msg ?? "Bad Request",
			}), 
			{status: 400}
		)
	},
    Unauthorized(msg?: any): Response {
		return new Response(
			JSON.stringify({
				status: 401,
				message: msg ?? "Unauthenticated",
			}), 
			{status: 401}
		)
    },
	NotFound(msg?: any): Response {
		return new Response(
			JSON.stringify({
				status: 404,
				message: msg ?? "Not Found",
			}), 
			{status: 404}
		)
	},
	MethodNotAllowed(msg?: any): Response {
		return new Response(
			JSON.stringify({
				status: 405,
				message: msg ?? "Method Not Allowed",
			}), 
			{status: 405}
		)
	},
	InternalServerError(msg?: any): Response {
		return new Response(
			JSON.stringify({
				status: 500,
				message: msg ?? "Internal Server Error",
			}), 
			{status: 500}
		)
	}
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
        console.error(err.message)
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

