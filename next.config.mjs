import path from "node:path";
const config = {
  webpack(config) {
    config.resolve.alias["@"] = path.resolve(process.cwd());
    return config;
  },
};
export default config;;
