import { EHttpStatusCode } from "../interfaces/commonbackend.types";

/**
 * Represents the base class for custom application errors.
 * Extends the native `Error` class to include additional properties such as HTTP status code,
 * operational flag, and optional error data.
 *
 * @extends Error
 *
 * @template EHttpStatusCode - Enum or type representing HTTP status codes.
 *
 * @property {EHttpStatusCode} statusCode - The HTTP status code associated with the error.
 * @property {boolean} isOperational - Indicates if the error is operational (expected) or a programming error.
 * @property {object | null} data - Optional additional data related to the error.
 *
 * @param {EHttpStatusCode} statusCode - The HTTP status code for the error.
 * @param {string} description - A human-readable description of the error.
 * @param {boolean} [isOperational=true] - Whether the error is operational (default: true).
 * @param {object | null} [data=null] - Optional additional data to attach to the error.
 *
 * @example
 * throw new BaseError(EHttpStatusCode.NOT_FOUND, 'Resource not found');
 */
class BaseError extends Error {
    public readonly statusCode: EHttpStatusCode;
    public readonly isOperational: boolean;
    public data: object | null;
    /**
     * Creates an instance of APIError.
     * @param {EHttpStatusCode} statusCode - The HTTP status code for the error. Defaults to INTERNAL_SERVER_ERROR.
     * @param {string} description - A human-readable description of the error. Defaults to "Internal Server Error".
     * @param {boolean} isOperational - Indicates if the error is operational (expected) or a programming error. Defaults to true.
     * @param {object|null} data - Optional additional data to include with the error.
     */
    constructor(
        statusCode: EHttpStatusCode,
        description: string,
        isOperational: boolean,
        data: object | null
    ) {
        super(description);

        // Set the prototype explicitly.
        Object.setPrototypeOf(this, new.target.prototype);

        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.data = data;
        this.message = description;

        // Maintains proper stack trace for where our error was thrown (only available on V8).
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this);
        }
    }
}

/**
 * Represents a custom API error that extends the {@link BaseError} class.
 * Used to standardize error handling for API responses.
 *
 * @extends BaseError
 *
 * @param {EHttpStatusCode} statusCode - The HTTP status code for the error. Defaults to INTERNAL_SERVER_ERROR.
 * @param {string} description - A human-readable description of the error. Defaults to "Internal Server Error".
 * @param {boolean} isOperational - Indicates if the error is operational (expected) or a programming error. Defaults to true.
 * @param {object|null} data - Optional additional data to include with the error.
 */
class APIError extends BaseError {
    /**
     * Creates an instance of APIError.
     * @param {EHttpStatusCode} statusCode - The HTTP status code for the error. Defaults to INTERNAL_SERVER_ERROR.
     * @param {string} description - A human-readable description of the error. Defaults to "Internal Server Error".
     * @param {boolean} isOperational - Indicates if the error is operational (expected) or a programming error. Defaults to true.
     * @param {object|null} data - Optional additional data to include with the error.
     */
    constructor(
        statusCode: EHttpStatusCode,
        description: string,
        isOperational: boolean,
        data: object | null
    ) {
        super(statusCode, description, isOperational, data);
    }
}

export { BaseError, APIError };
