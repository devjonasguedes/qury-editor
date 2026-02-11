import 'bootstrap-icons/font/bootstrap-icons.css';

import { createDbConnection } from './modules/dbConnection.js';
import { initHome } from './render.js';

const setPlatformAttribute = () => {
	if (typeof document === 'undefined') return;
	const platformSource =
		(typeof navigator !== 'undefined' && navigator.platform) ||
		(typeof navigator !== 'undefined' && navigator.userAgent) ||
		'';
	if (/Mac/i.test(platformSource)) {
		document.documentElement.dataset.platform = 'darwin';
	}
};

setPlatformAttribute();

const namespacedApi = (typeof window !== 'undefined' && window.api)
	? ({ ...(window.api.db || {}), ...(window.api.electron || {}) })
	: window.api;

const db = createDbConnection(namespacedApi);

initHome({ api: db });
