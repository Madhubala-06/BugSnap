// Vercel serverless entry. Every request is rewritten here (see vercel.json).
const { getHandler } = require("../dist/server")

module.exports = async (req, res) => {
  const handler = await getHandler()
  return handler(req, res)
}
