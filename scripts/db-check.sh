#!/bin/sh
set -eu

dir=node_modules/.cache/db-check
rm -rf "$dir"
mkdir -p "$dir"
cp -R drizzle "$dir/"
printf 'import config from "../../../drizzle.config.js";\nexport default { ...config, out: "%s/drizzle" };\n' "$dir" >"$dir/drizzle.config.js"
npx drizzle-kit generate --config "$dir/drizzle.config.js" >/dev/null

if ! diff -r drizzle "$dir/drizzle" >/dev/null; then
  echo 'src/db/schema.ts has changes that no migration in drizzle/ covers. Run "npm run db:generate" and commit the new files in drizzle/.' >&2
  exit 1
fi
