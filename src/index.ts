import { app } from "./app";
import { migrate } from "./db";

await migrate();

const port = Number(process.env.PORT ?? 3000);
app.listen(port);
console.log(`InkSign listening on http://localhost:${port}`);
