"use strict";

function blockPopupsFunc({
  iframeId,
  showNotification,
  popupResources = {}
}) {
  const POPUP_MESSAGE_TYPES = {
    popupBlocked: 'popup-blocked',
    popupUserAction: 'popup-user-action',
    stndzPopupAction: 'stndz-popup-action',
    stndzPopupUpdate: 'stndz-popup-update',
    stndzShowPopupNotification: 'stndz-show-popup-notification'
  };
  const POPUP_OPTIONS = {
    allow: 'allow',
    block: 'block',
    once: 'once'
  };
  const IS_POPUP_RESULT = {
    yes: 'yes',
    no: 'no',
    unknown: 'unknown'
  };
  const popupAllowedRegex = /^(http(s)?:)?\/\/([^/]*\.)?(pinterest\.com|paid\.outbrain\.com|twitter\.com|paypal\.com|yahoo\.com|facebook\.com|linkedin\.com|salesforce\.com|amazon\.co|google\.co|aol\.com|aol\.de)/i;
  const popupAllowHosts = /^http(s):\/\/([^/]*\.)?(search\.yahoo\.com|linkedin\.com|facebook\.com|google\.com|aol\.com|aol\.de)/i;
  const anchorPopupsExcludedHosts = {
    'sh.st': true
  };
  const popupDeniedRegexs = ['directrev\\.com', 'tradeadexchange\\.com', 'liveadexchanger\\.com', 'interyield\\.', 'ordingly\\.com', 'peritas247\\.info', 'goodbookbook\\.com', 'word-my\\.com', 'terraclicks\\.com', 'tracki112\\.com', 'popped', 'ahtamsu\\.ru', 'startnewtab\\.com', 'onclickads\\.net', 'europacash\\.com', 'wordkeyhelper\\.com', 'd1110e4\\.se', 'buzzonclick\\.com', 'adultadworld\\.com', '3wr110\\.net', 'ads\\.xladzop\\.com', 'mtagmonetizationc\\.com', 'ad\\.propellerads\\.com', 'popmyads\\.com', 'popunderclick\\.com', 'pipeaota\\.com', 'expocrack\\.com', 'trafficforce\\.com', 'poprockets\\.info', 'trustedsurf\\.com', 'smartnewtab\\.com', 'wonderlandads\\.com', 'admediatracker\\.com', 'n\\d{3}adserv\\.com', 'adland\\.co', 'adexc\\.net', 'buzzadexchange\\.com', '104\\.197\\.4\\.220', 'xmediaserve\\.com', 'popcash\\.net', 'adpop-\\d\\.com', 'adk2x\\.com', 'adplxmd\\.com', 'exoclick\\.com', 'bounceads\\.net', 'whoads\\.net', 'onclickpredictiv\\.com', 'installation\\.club', 'advertiserurl\\.com', 'pureadexchange\\.com', 'adsrvmedia\\.net', 'linkmyc\\.com', 'popmycash\\.com', 'clickppcbuzz\\.com', 'adsxn\\.com', 'bestadbid\\.com', 'clickadu\\.com', 'adxpansion\\.com', 'med4ad\\.com', 'appnord\\.xyz', 'rutorads\\.com', 'buzzadnetwork\\.com', 'qrlsx\\.com', 'pipsol\\.net', 'prosoftwarepc\\.com', 'performanceadexchange\\.com', 'buy-targeted-traffic\\.com', 'tabcontent\\.net', 'popunder\\.[a-z]{2,4}', 'popads\\.[a-z]{2,4}', 'wwwpromoter\\.com', '([^\\/\\.]*\\.)([^\\/\\.]*\\.)711\\d*\\.com', 'isanalyze\\.com', 'adrunnr\\.com', 'trackpprofile\\.com', 'adnetworkperformance\\.com', 'traffic-media\\.co', 'doublepimp\\.com', 'creatives\\.livejasmin\\.com', 'electosake\\.com', 'maxonclick\\.com', 'onclasrv\\.com', 'exdynsrv\\.com', 'ulrtep\\.com', 'onclkds\\.com', 'bororango\\.com', 'ijquery11\\.com', 'spotscenered\\.info', 'parserworld\\.info'].map(r => new RegExp(r, 'i'));
  const stndz = {
    active: true,
    originalWindowOpen: window.open,
    originalDocumentCreateElement: document.createElement,
    stndzPopupActionWindow: null,
    popupNotificationOpen: null,
    stndzPopupClicked: () => {},
    hidePopupNotification: () => {},
    showPopupNotification: () => {},
    togglePopupNotificationHelp: () => {},
    stndzPopupAction: () => {}
  };
  function isPopup(url) {
    if (!url) {
      if (popupAllowHosts.test(location.href)) {
        return IS_POPUP_RESULT.no;
      }
      return IS_POPUP_RESULT.unknown;
    }
    if (popupAllowedRegex.test(url)) {
      return IS_POPUP_RESULT.no;
    }
    for (const rule of popupDeniedRegexs) {
      if (rule.test(url)) {
        return IS_POPUP_RESULT.yes;
      }
    }
    if (popupAllowHosts.test(location.href)) {
      return IS_POPUP_RESULT.no;
    }
    return IS_POPUP_RESULT.unknown;
  }
  window.open = function (...args) {
    const openPopupFunc = () => stndz.originalWindowOpen.apply(window, args);
    if (!stndz.active) {
      return openPopupFunc();
    }
    if (args[2]?.includes('forceOpen')) {
      return openPopupFunc();
    }
    const popupUrl = typeof args[0] === 'string' ? args[0] : '';
    const block = isPopup(popupUrl);
    if (block === IS_POPUP_RESULT.yes) {
      showPopupNotificationWindow('ad-popup', popupUrl, args);
      return null;
    }
    if (block === IS_POPUP_RESULT.no) {
      return openPopupFunc();
    }
    if (popupUrl.startsWith('data:')) {
      showPopupNotificationWindow('data-popup', popupUrl, args);
      return null;
    }
    const targetName = args.length >= 2 ? args[1] : null;
    if (targetName === '_parent' || targetName === '_self' || targetName === '_top') {
      return openPopupFunc();
    }
    if (!window.event) {
      return openPopupFunc();
    }
    if (popupUrl.startsWith('/') && !popupUrl.startsWith('//')) {
      return openPopupFunc();
    }
    let host = '';
    try {
      host = new URL(popupUrl).host;
    } catch (e) {}
    const locationHost = window.location.host;
    if (host.includes(locationHost) || host && locationHost.includes(host)) {
      return openPopupFunc();
    }
    const {
      target,
      currentTarget
    } = window.event;
    const currentTargetValid = currentTarget && currentTarget !== window && currentTarget !== document && currentTarget !== document.body;
    const targetValid = target?.tagName === 'A' && target.href.startsWith('http');
    if (currentTargetValid || targetValid) {
      return openPopupFunc();
    }
    if (showNotification) {
      showPopupNotificationWindow('not-user-initiated', popupUrl, args);
    }
    return null;
  };
  document.createElement = function (tagName, options) {
    const element = stndz.originalDocumentCreateElement.apply(document, [tagName, options]);
    if (element.tagName === 'A') {
      const link = element;
      const createTime = new Date().getTime();
      element.addEventListener('click', event => {
        if (!stndz.active) {
          return;
        }
        if (link.href === '') {
          return;
        }
        if (anchorPopupsExcludedHosts[document.location.host]) {
          link.target = '_top';
        } else {
          const block = isPopup(link.href);
          const now = new Date().getTime();
          const isNewExternalLink = now - createTime < 50 && block === IS_POPUP_RESULT.unknown && !window.location.hostname.includes(link.hostname);
          if (block === IS_POPUP_RESULT.yes || isNewExternalLink) {
            event.preventDefault();
            showPopupNotificationWindow('create-link', link.href, [], () => element.click());
          }
        }
      }, true);
    }
    return element;
  };
  window.addEventListener('message', event => {
    switch (event.data.type) {
      case POPUP_MESSAGE_TYPES.stndzShowPopupNotification:
        if (window !== window.top || !stndz.active || event.data.payload.iframeId !== iframeId) {
          return;
        }
        stndz.stndzPopupActionWindow = event.source;
        stndz.stndzPopupClicked = function (option) {
          stndz.hidePopupNotification();
          stndz.stndzPopupActionWindow?.postMessage({
            type: POPUP_MESSAGE_TYPES.stndzPopupAction,
            payload: {
              option
            }
          }, {
            targetOrigin: event.origin
          });
        };
        if (stndz.popupNotificationOpen === false) {
          stndz.showPopupNotification();
        }
        if (stndz.popupNotificationOpen === null) {
          const notificationElement = createNotificationOnPage();
          stndz.showPopupNotification = function () {
            stndz.popupNotificationOpen = true;
            notificationElement.classList.remove('close');
            const hidePopupNotificationId = window.setTimeout(stndz.hidePopupNotification, 30 * 1000);
            stndz.hidePopupNotification = function () {
              stndz.popupNotificationOpen = false;
              notificationElement.classList.add('close');
              clearTimeout(hidePopupNotificationId);
            };
            notificationElement.onmouseover = function () {
              clearTimeout(hidePopupNotificationId);
            };
          };
          stndz.togglePopupNotificationHelp = () => {
            notificationElement.classList.toggle('show-help');
          };
          stndz.showPopupNotification();
        }
        break;
      case POPUP_MESSAGE_TYPES.stndzPopupAction:
        stndz.stndzPopupAction(event.data.payload.option);
        break;
      default:
        break;
    }
  }, false);
  function showPopupNotificationWindow(blockType, popupUrl, args, clicker) {
    const openPopupFunc = () => clicker ? clicker() : stndz.originalWindowOpen.apply(window, args);
    if (!stndz.active) {
      openPopupFunc();
    }
    if (!showNotification) {
      return;
    }
    let popupHost = '';
    if (popupUrl === 'about:blank') {
      popupHost = 'about:blank';
    } else {
      try {
        const {
          host
        } = new URL(popupUrl);
        popupHost = host.startsWith('www.') ? host.substring(4) : host;
      } catch (e) {}
    }
    stndz.stndzPopupAction = function (option) {
      window.postMessage({
        type: POPUP_MESSAGE_TYPES.popupUserAction,
        payload: {
          iframeId,
          popupHost,
          popupUrl,
          option,
          blockType
        }
      }, '*');
      if (option === POPUP_OPTIONS.once) {
        openPopupFunc();
      }
      if (option === POPUP_OPTIONS.allow) {
        stndz.active = false;
        openPopupFunc();
      }
      if (option === POPUP_OPTIONS.block) {
        showNotification = false;
      }
    };
    window.top?.postMessage({
      type: POPUP_MESSAGE_TYPES.stndzShowPopupNotification,
      payload: {
        iframeId
      }
    }, '*');
    window.postMessage({
      type: POPUP_MESSAGE_TYPES.popupBlocked,
      payload: {
        iframeId,
        blockType,
        popupHost,
        popupUrl
      }
    }, '*');
  }
  function createNotificationOnPage() {
    const style = document.createElement('style');
    style.textContent = `
    .stndz-popup-notification {
      background: #484a54;
      border-radius: 4px;
      border: solid 1px #999999;
      box-shadow: 0 2px 5px #444444;
      box-sizing: border-box;
      color: #fff;
      font-family: sans-serif;
      font-size: 12px;
      left: 0;
      padding: 8px 16px;
      position: fixed;
      right: 0;
      top: 0;
      width: 100vw;
      z-index: 2147483647;
    }
    
    .stndz-popup-notification.close {
      display: none;
    }
    
    .stndz-popup-notification-top-row {
      align-items: center;
      display: flex;
      justify-content: space-between;
    }
    
    .stndz-popup-notification-logo {
      width: 24px;
    }
    
    .stndz-popup-notification-top-row-center {
      align-items: center;
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    
    .stndz-popup-notification-help {
      display: none;
      padding: 8px 4px;
    }
    
    .stndz-popup-notification.show-help .stndz-popup-notification-help {
      display: block;
    }
    
    .stndz-button {
      background-repeat: no-repeat !important;
      background: #fff !important;
      border-radius: 4px !important;
      border: none !important;
      box-shadow: inset 0px 1px 0px #ffffff, inset 0 -1px 2px #acacac !important;
      color: #484a54 !important;
      cursor: pointer !important;
      font-family: sans-serif !important;
      font-size: 12px !important;
      height: 24px !important;
      line-height: 16px !important;
      padding: 4px 12px !important;
      text-align: center !important;
    }
    
    .stndz-button:hover {
      background: #cacaca !important;
      color: #2d2d2d !important;
    }
    
    .icon-button {
      background: none !important;
      border: none !important;
      cursor: pointer !important;
      height: 24px !important;
      padding: 4px !important;
      width: 24px !important;
    }
    
    .icon-button img {
      height: 16px !important;
      width: 16px !important;
    }
    `;
    document.documentElement.appendChild(style);
    const div = document.createElement('div');
    div.setAttribute('class', 'stndz-popup-notification');
    div.innerHTML = `
    <div class="stndz-popup-notification-top-row">
      <img class="stndz-popup-notification-logo" alt="" src="${popupResources['icon.png']}" />
      <div class="stndz-popup-notification-top-row-center">
        <div>Site popup blocking settings:</div>
        <button id="stndz-popup-allow-once" class="stndz-button">Allow once</button>
        <button id="stndz-popup-allow" class="stndz-button">Allow always</button>
        <button id="stndz-popup-block" class="stndz-button">Block always</button>
        <button id="stndz-popup-help" class="icon-button">
          <img alt="" src="${popupResources['help.png']}" />
        </button>
      </div>
      <button id="stndz-popup-close" class="icon-button">
        <img alt="" src="${popupResources['close.png']}" />
      </button>
    </div>
    <div class="stndz-popup-notification-help">
      The site tried to open a popup and Stands blocked it.
      <br />
      If you don't trust this site you should click <b>"Block always"</b>, if you do click <b>"Allow always"</b>.
      <br />
      If you're not sure click <b>"Allow once"</b> which will open the popup and pause popup blocking for the current page visit.
      <br />
      You can always change your settings in the application window.
    </div>
    `;
    document.body.appendChild(div);
    const handlers = [{
      id: 'stndz-popup-allow-once',
      action: () => stndz.stndzPopupClicked(POPUP_OPTIONS.once)
    }, {
      id: 'stndz-popup-allow',
      action: () => stndz.stndzPopupClicked(POPUP_OPTIONS.allow)
    }, {
      id: 'stndz-popup-block',
      action: () => stndz.stndzPopupClicked(POPUP_OPTIONS.block)
    }, {
      id: 'stndz-popup-help',
      action: () => stndz.togglePopupNotificationHelp()
    }, {
      id: 'stndz-popup-close',
      action: () => stndz.hidePopupNotification()
    }];
    for (const {
      id,
      action
    } of handlers) {
      document.getElementById(id)?.addEventListener('click', event => {
        event.preventDefault();
        action();
      }, true);
    }
    return div;
  }
  document.addEventListener('sendToPopupBlocking', e => {
    const detail = JSON.parse(e.detail);
    if (detail.type === POPUP_MESSAGE_TYPES.stndzPopupUpdate && iframeId === detail.payload.iframeId && typeof detail.payload.active === 'boolean') {
      stndz.active = detail.payload.active;
    }
  });
  document.addEventListener('click', e => {
    const target = e.target;
    const isSuspiciousLink = target.tagName === 'A' && target.onclick && target.target === '_blank';
    if (isSuspiciousLink) {
      e.preventDefault();
      showPopupNotificationWindow('ad-popup', '', [], () => {
        target.onclick?.(e);
        setTimeout(() => {
          window.open(target.href, '_blank', 'forceOpen');
        }, 100);
      });
    }
  }, true);
}
document.addEventListener('sendToPopupBlocking', e => {
  const detail = JSON.parse(e.detail);
  if (detail.type === {
    stndzPopupInfo: 'stndz-popup-info'
  }.stndzPopupInfo) {
    blockPopupsFunc(detail.payload);
  }
});