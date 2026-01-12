const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const t = await p.tenant.findFirst();
  console.log(t ? Object.keys(t) : "no tenant found");
  await p.$disconnect();
})();
