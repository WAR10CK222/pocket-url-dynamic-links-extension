export enum EAppEnvironmentType {
    PRODUCTION = "production",
    STAGING = "staging",
    DEVELOPMENT = "development",
}

export const ResponseMessage = {
    SUCCESS: "Success",
    ERROR: "Error",
    NOT_FOUND: "Not Found",
    BAD_REQUEST: "Bad Request",
    UNAUTHORIZED: "Unauthorized",
    SOMETHING_WENT_WRONG: "Something went wrong",
    INTERNAL_SERVER_ERROR: "Internal Server Error",
    ALREADY_EXISTS: "Already exists",
    TOO_MANY_REQUESTS: "Too many requests",
};

export enum EHttpStatusCode {
    OK = 200,
    CREATED = 201,
    NO_CONTENT = 204,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 403,
    NOT_FOUND = 404,
    CONFLICT = 409,
    TOO_MANY_REQUESTS = 429,
    INTERNAL_SERVER_ERROR = 500,
    SERVICE_UNAVAILABLE = 503,
}

export type THttpResponse = {
    success: boolean;
    statusCode: number;
    request: {
        ip?: string | null;
        method: string;
        url: string;
    }
    message: string;
    data?: unknown;
}

export type THttpError = {
    success: boolean;
    statusCode: number;
    request: {
        ip?: string | null;
        method: string;
        url: string;
    }
    message: string;
    data?: unknown;
    trace: object | null;
}
