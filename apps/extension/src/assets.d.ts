// Plasmo turns "data-base64:~assets/..." imports into data URLs at build time.
declare module "data-base64:*" {
  const value: string
  export default value
}
