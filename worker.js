export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    const isPageView =
      method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html");

    const isFirmwareDownload =
      method === "GET" &&
      url.pathname === "/firmware/update.zip";

    if (isPageView || isFirmwareDownload) {
      try {
        env.STATS.writeDataPoint({
          indexes: [isFirmwareDownload ? "firmware_download" : "page_view"],
          blobs: [
            url.hostname,
            url.pathname,
            request.cf?.country || "XX"
          ],
          doubles: [1]
        });
      } catch (_) {
        // Ошибка статистики не должна мешать работе сайта или прошивке.
      }
    }

    return env.ASSETS.fetch(request);
  }
};
