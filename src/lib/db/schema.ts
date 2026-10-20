export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_path TEXT,
  identity_image_path TEXT NOT NULL,
  gender TEXT DEFAULT 'female',
  is_default INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS garments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  image_path TEXT NOT NULL,
  color TEXT,
  tags TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS outfits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  model_id TEXT,
  scene_prompt TEXT,
  front_image_path TEXT,
  side_image_path TEXT,
  back_image_path TEXT,
  item_list_image_path TEXT,
  suite_image_paths TEXT,
  status TEXT DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (model_id) REFERENCES models(id)
);

CREATE TABLE IF NOT EXISTS outfit_garments (
  id TEXT PRIMARY KEY,
  outfit_id TEXT NOT NULL,
  garment_id TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  FOREIGN KEY (outfit_id) REFERENCES outfits(id) ON DELETE CASCADE,
  FOREIGN KEY (garment_id) REFERENCES garments(id)
);

CREATE TABLE IF NOT EXISTS outfit_generations (
  id TEXT PRIMARY KEY,
  outfit_id TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  price REAL NOT NULL,
  calls INTEGER NOT NULL,
  total_cost REAL NOT NULL,
  images TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  task_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (outfit_id) REFERENCES outfits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS image_generations (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  price REAL NOT NULL,
  calls INTEGER NOT NULL,
  total_cost REAL NOT NULL,
  images TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  task_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  params TEXT NOT NULL,
  result TEXT,
  error TEXT,
  progress INTEGER DEFAULT 0,
  provider_task_id TEXT,
  provider TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);
`;
