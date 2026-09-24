const home = document.getElementById("home");
const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const frameWrapper = document.getElementById("sj-frame-wrapper");
const frameElement = document.getElementById("sj-frame");
const frameUrl = document.getElementById("sj-frame-url");
const errorEl = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");
const chromeForm = document.getElementById("chrome-form");
const chromeAddress = document.getElementById("chrome-address");
const btnLucky = document.getElementById("btn-lucky");
const btnHome = document.getElementById("btn-home");
const btnReload = document.getElementById("btn-reload");

const luckySites = [
	"https://en.wikipedia.org/wiki/Special:Random",
	"https://www.youtube.com",
	"https://news.ycombinator.com",
	"https://www.reddit.com",
	"https://www.wikipedia.org",
	"https://www.nytimes.com",
];

let controller;
let frame;
let lastTarget = "";

function looksLikeUrl(value) {
	const v = value.trim();
	if (!v) return false;
	if (/^https?:\/\//i.test(v)) return true;
	if (v.includes(" ") ) return false;
	if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/|$)/i.test(v)) return true;
	return /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[\/?#].*)?$/i.test(v);
}

function resolveTarget(raw) {
	const value = raw.trim();
	if (!value) throw new Error("Type something to search or visit.");

	if (looksLikeUrl(value)) {
		return /^https?:\/\//i.test(value) ? value : `https://${value}`;
	}

	const engine = searchEngine.value || "https://www.google.com/search?q=%s";
	return engine.replace("%s", encodeURIComponent(value));
}

function showHome() {
	frameWrapper.hidden = true;
	home.hidden = false;
	clearError();
	address.focus();
}

function showBrowser() {
	home.hidden = true;
	frameWrapper.hidden = false;
}

function clearError() {
	errorEl.hidden = true;
	errorCode.hidden = true;
	errorEl.textContent = "";
	errorCode.textContent = "";
}

function showErrorScreen(message, details) {
	showHome();
	errorEl.hidden = false;
	errorEl.textContent = message;
	if (details) {
		errorCode.hidden = false;
		errorCode.textContent = details;
	}
}

async function init() {
	controller = await initBootstrap();

	const cachePlugin = new $scramjetUtils.HttpCachePlugin();
	const urlWatcher = new $scramjetUtils.UrlWatcherPlugin((url) => {
		frameUrl.textContent = url;
		chromeAddress.value = url;
	});
	const catchEscapedLinks = new $scramjetUtils.CatchEscapedLinksPlugin(
		(url) => new URL(`/?goto=${encodeURIComponent(url.href)}`, location.origin)
	);

	frame = controller.createFrame(frameElement, {
		plugins: [cachePlugin, urlWatcher, catchEscapedLinks],
	});
}

async function navigate(raw, { syncInputs = true } = {}) {
	clearError();
	const target = resolveTarget(raw);
	lastTarget = target;

	if (syncInputs) {
		address.value = raw.trim();
		chromeAddress.value = target;
	}

	if (!frame || !controller) {
		await init();
	}

	showBrowser();
	await frame.go(target);
}

form.addEventListener("submit", async (e) => {
	e.preventDefault();
	try {
		await navigate(address.value);
	} catch (err) {
		showErrorScreen(err.message, err.stack);
	}
});

chromeForm.addEventListener("submit", async (e) => {
	e.preventDefault();
	try {
		await navigate(chromeAddress.value);
	} catch (err) {
		showErrorScreen(err.message, err.stack);
	}
});

btnLucky.addEventListener("click", async () => {
	const pick = luckySites[Math.floor(Math.random() * luckySites.length)];
	address.value = pick;
	try {
		await navigate(pick);
	} catch (err) {
		showErrorScreen(err.message, err.stack);
	}
});

btnHome.addEventListener("click", () => {
	showHome();
});

btnReload.addEventListener("click", async () => {
	if (!lastTarget) return;
	try {
		await navigate(lastTarget, { syncInputs: false });
	} catch (err) {
		showErrorScreen(err.message, err.stack);
	}
});

const goto = new URL(location.href).searchParams.get("goto");
if (goto) {
	history.replaceState(null, "", location.pathname);
	address.value = goto;
	navigate(goto).catch((err) => showErrorScreen(err.message, err.stack));
} else {
	address.focus();
}
