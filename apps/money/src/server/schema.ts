/**
 * Schema initialization — creates all tables in the DO SQLite storage.
 * Called once during DO boot.
 */
type SqlExecFn = (query: string, ...params: any[]) => void;
type SqlQueryOneFn = <T extends Record<string, unknown>>(
  query: string,
  ...params: any[]
) => T | null;

const CREATE_TABLES = [
  // accounts
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    offbudget INTEGER DEFAULT 0,
    closed INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    balance_current INTEGER,
    balance_available INTEGER,
    balance_limit INTEGER,
    mask TEXT,
    official_name TEXT,
    last_reconciled TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // category_groups
  `CREATE TABLE IF NOT EXISTS category_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_income INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    hidden INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // categories
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_income INTEGER DEFAULT 0,
    group_id TEXT REFERENCES category_groups(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    hidden INTEGER DEFAULT 0,
    goal_def TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_categories_group ON categories(group_id)`,

  // transactions
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    payee TEXT,
    notes TEXT,
    date TEXT NOT NULL,
    cleared INTEGER DEFAULT 1,
    reconciled INTEGER DEFAULT 0,
    imported_description TEXT,
    starting_balance_flag INTEGER DEFAULT 0,
    sort_order INTEGER,
    is_parent INTEGER DEFAULT 0,
    is_child INTEGER DEFAULT 0,
    parent_id TEXT,
    transfer_id TEXT,
    schedule_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_parent ON transactions(parent_id)`,

  // budgets
  `CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    month INTEGER NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL DEFAULT 0,
    carryover INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month)`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id)`,

  // budget_months
  `CREATE TABLE IF NOT EXISTS budget_months (
    id TEXT PRIMARY KEY,
    buffered INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // payees
  `CREATE TABLE IF NOT EXISTS payees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    transfer_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    favorite INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payees_name ON payees(name)`,

  // schedules
  `CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    name TEXT,
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    payee_id TEXT REFERENCES payees(id) ON DELETE SET NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    amount INTEGER,
    start_date TEXT,
    recurrence_rules TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    completed INTEGER DEFAULT 0,
    posts_transaction INTEGER DEFAULT 0,
    custom_upcoming_length INTEGER,
    next_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // rules
  `CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    stage TEXT NOT NULL DEFAULT 'pre',
    conditions_op TEXT NOT NULL DEFAULT 'and',
    conditions TEXT NOT NULL,
    actions TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // tags
  `CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    created_at TEXT NOT NULL
  )`,

  // transaction_tags
  `CREATE TABLE IF NOT EXISTS transaction_tags (
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
  )`,

  // custom_reports
  `CREATE TABLE IF NOT EXISTS custom_reports (
    id TEXT PRIMARY KEY,
    name TEXT,
    start_date TEXT,
    end_date TEXT,
    date_static INTEGER DEFAULT 0,
    date_range TEXT,
    mode TEXT,
    group_by TEXT,
    sort_by TEXT DEFAULT 'desc',
    interval TEXT,
    balance_type TEXT,
    show_empty INTEGER DEFAULT 0,
    show_offbudget INTEGER DEFAULT 0,
    show_hidden INTEGER DEFAULT 0,
    show_uncategorized INTEGER DEFAULT 0,
    trim_intervals INTEGER DEFAULT 0,
    include_current INTEGER DEFAULT 1,
    graph_type TEXT,
    conditions TEXT DEFAULT '[]',
    conditions_op TEXT DEFAULT 'and',
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // dashboard_widgets
  `CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    meta TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // exchange_rates
  `CREATE TABLE IF NOT EXISTS exchange_rates (
    id TEXT PRIMARY KEY,
    usd_to_idr INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // settings
  `CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // notes (generic key-value notes for any entity)
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    noteable_type TEXT NOT NULL,
    noteable_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // transaction_filters
  `CREATE TABLE IF NOT EXISTS transaction_filters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    conditions TEXT NOT NULL,
    conditions_op TEXT DEFAULT 'and',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

export function initializeStorage(
  exec: SqlExecFn,
  queryOne: SqlQueryOneFn,
  log: (message: string) => void,
) {
  log("initializing storage: creating tables...");
  for (const sql of CREATE_TABLES) {
    exec(sql);
  }
  log("storage initialized successfully");

  // Insert default exchange rate
  exec(
    "INSERT OR IGNORE INTO exchange_rates (id, usd_to_idr, updated_at) VALUES (?, ?, ?)",
    "latest",
    16000,
    new Date().toISOString(),
  );
}
