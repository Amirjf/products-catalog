#!/bin/sh
set -eu

message=$(grep -v '^#' "$1" || true)
subject=$(printf '%s\n' "$message" | head -n 1)
types='build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test'

case "$subject" in
  "Merge "* | "Revert \""*) exit 0 ;;
esac

if ! printf '%s' "$subject" | grep -Eq "^($types)(\([a-z0-9-]+\))?!?: [^ ]"; then
  echo "Commit subject \"$subject\" must look like \"type(scope): subject\", with type one of $types and a space after the colon." >&2
  exit 1
fi

if printf '%s' "$subject" | sed -E 's/^[^:]+: //' | grep -Eq "(^| )($types)(\([a-z0-9-]+\))?!?: "; then
  echo "Commit subject \"$subject\" holds more than one change. Split it into one commit per type(scope)." >&2
  exit 1
fi

if [ -n "$(printf '%s\n' "$message" | sed -n 2p)" ]; then
  echo "Commit subject \"$subject\" runs onto a second line, and git joins those lines into one subject. Put a blank line after the first line, or split the change into several commits." >&2
  exit 1
fi
