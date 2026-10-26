# WhereAmI

A Claude Code plugin that shows, at a glance, where the current session runs:

- **💻 LOCAL on `<machine>`** — a green band above the prompt when Claude runs on your own machine (Remote Control included)
- **☁ CLOUD container (`<name>`)** — an amber band when it runs in a cloud container

The same text goes in the status line, and `/whereami` prints it.

## Moving a cloud session back to your machine

Started a session in the cloud by mistake? Type **`/go-local`** in it. Claude commits and
pushes the work in progress, and you get one line to paste in a terminal on your machine:

```bash
D="$HOME/dev/<repo>"; [ -d "$D/.git" ] || git clone https://github.com/<owner>/<repo>.git "$D"; cd "$D" && claude --teleport <session-id>
```

It goes to your local checkout (cloning it if missing) and runs `claude --teleport`, which checks out
the session's branch and brings the whole conversation along. The cloud copy stays as it was.
Run `/remote-control` afterwards to keep steering the session from your phone.

Where your checkouts live is set in the plugin's options:

- **Local folder for repositories** (`workspaceRoot`, default `$HOME/dev`): a repository is looked for at `<folder>/<repository name>`
- **Local checkouts** (`workspaces`): `owner/repo=folder` pairs, comma-separated, for repositories kept elsewhere

## Install

At the prompt of a terminal session:

```
/plugin install whereami --marketplace Yasston/claude-whereami
```

From a shell:

```bash
claude plugin install whereami --marketplace Yasston/claude-whereami
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins,
Add marketplace with `Yasston/claude-whereami`, then Add plugin.

### In cloud sessions

A cloud container never sees your machine's settings. To get the band there too, add these lines to
your cloud environment's setup script (one environment covers every repository that uses it):

```bash
claude plugin marketplace add Yasston/claude-whereami
claude plugin install whereami
```

## How it tells

Cloud sessions set `CLAUDE_CODE_REMOTE=true` and name themselves in `CLAUDE_CODE_REMOTE_SESSION_ID`.
The machine name is `HOSTNAME`, or `/etc/hostname`.

## Licence

MIT
