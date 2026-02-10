import 'bootstrap-icons/font/bootstrap-icons.css';

import { createDbConnection } from './modules/dbConnection.js';
import { initHome } from './render.js';

const namespacedApi = (typeof window !== 'undefined' && window.api)
	? ({ ...(window.api.db || {}), ...(window.api.electron || {}) })
	: window.api;

const db = createDbConnection(namespacedApi);

initHome({ api: db });
