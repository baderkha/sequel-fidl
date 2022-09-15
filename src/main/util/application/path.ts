import path from "path";
import xdgAppPaths from 'xdg-app-paths';

/**
 * Use this application path in all your app to store data
 */
export const BASE_APP_DATA_PATH = path.join(xdgAppPaths.data({
    isolated: false
}),"sql-fidl")

/**
 * Use this for any client side configurations
 */
export const BASE_APP_CONFIG_PATH = path.join(xdgAppPaths.config({
    isolated : false
}),"sql-fidl")