import { env } from "process";
import path from "path";

import { EAppEnvironmentType } from "@/common/interfaces/commonbackend.types";

export const ENV_VARIABLES = {
    APP_ENVIRONMENT: env.NODE_ENV ?? EAppEnvironmentType.DEVELOPMENT,
    HTML_FOLDER_PATH: path.join("public", "html"),
    IMAGE_FOLDER_PATH: path.join("public", "images"),
    PUBLIC_FOLDER_PATH: path.join("public"),
}

export const PORT = env.NODE_ENV === EAppEnvironmentType.PRODUCTION ? 8080 : 3000;