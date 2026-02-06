import 'bootstrap-icons/font/bootstrap-icons.css';

import { createDbConnection } from './modules/dbConnection.js';
import { initHome } from './render.js';

const db = createDbConnection(window.api);

initHome({ api: db });
