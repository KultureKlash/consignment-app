import prisma from "~/db.server";

export async function loader() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: true, ts: new Date().toISOString() });
  } catch {
    return Response.json({ status: "error", db: false, ts: new Date().toISOString() }, { status: 503 });
  }
}
