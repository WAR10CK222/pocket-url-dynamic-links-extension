import axios from "axios";
import { expect } from "chai";

describe("pocket-url", () => {
    it("should respond with the configured pocket-url", async () => {
        const expected = "Hello World from pocket-url";

        const httpFunctionUri = "http://localhost:5001/demo-test/us-central1/ext-pocket-url-greetTheWorld/";
        const res = await axios.get(httpFunctionUri);

        return expect(res.data).to.eql(expected);
    }).timeout(10000);
});
