import "dotenv/config";
import express, { Errback, Request, Response } from "express";
import { ENV_VARIABLES, PORT } from "./config/env";
import { getNotFoundResponse } from "@/modules/dynamic-links/dynamic-links.index";
import router from "@/modules/index";

const app = express();

app.use("/images", express.static(ENV_VARIABLES.IMAGE_FOLDER_PATH));
app.use("/html", express.static(ENV_VARIABLES.HTML_FOLDER_PATH));
app.use("/", router);
app.all("/{*any}", (request, response) => {
    return response.status(404).send(getNotFoundResponse());
});

app.use((error: Errback, request: Request, response: Response) => {
    console.error("Error occurred:", error);
    response.status(500).send("Internal Server Error");
});

app.listen(PORT, () => {
    console.log("Server is running on port ", PORT);
});

export default app;
