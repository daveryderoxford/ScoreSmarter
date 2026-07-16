/**
 * Fully Kiosk Browser JavaScript interface.
 * Present only when the SPA runs inside Fully Kiosk Browser.
 * @see https://www.fully-kiosk.com/en/#websiteintegration
 */
interface FullyKiosk {
  getDeviceId(): string;
}

declare const fully: FullyKiosk | undefined;
