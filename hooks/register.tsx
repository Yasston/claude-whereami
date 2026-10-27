import type { EngineInterface, Register } from 'claude-code'

import {
  cloudTitle,
  goLocalCommand,
  isRenameThread,
  label,
  localFolder,
  repoFromRemote,
} from './place.ts'
import type { Place } from './place.ts'

// Cloud sessions set CLAUDE_CODE_REMOTE=true and name themselves in
// CLAUDE_CODE_REMOTE_SESSION_ID; a local session, Remote Control included,
// sets neither.
const findPlace = async ($: EngineInterface): Promise<Place> => {
  const remote = await $.env.get('CLAUDE_CODE_REMOTE')
  const sessionId = (await $.env.get('CLAUDE_CODE_REMOTE_SESSION_ID')) ?? null
  let machine = (await $.env.get('HOSTNAME')) ?? ''
  if (machine === '') {
    try {
      machine = (await $.fs.read('/etc/hostname')).trim()
    } catch {
      machine = 'unknown machine'
    }
  }
  return { isCloud: remote === 'true', machine, sessionId }
}

// Found once per load: where a session runs doesn't change while it runs.
let place: Place | null = null

const getPlace = async ($: EngineInterface): Promise<Place> => {
  if (place === null) place = await findPlace($)
  return place
}

// The pane shows in apps that draw panes (the desktop app, on the right) and
// in a wide terminal; the band above the prompt covers the rest.
const PANE = 'whereami'

// In a project thread that runs in the cloud, the thread's title carries the
// cloud mark: the model renames the thread once, keeping its title, and the
// tool.call hook below adds the mark to every title it sets.
const MARK_TITLE =
  'WhereAmI: this session runs in a cloud container. Call the rename_thread tool ' +
  'once now, in this turn, with the thread\'s ' +
  'current title unchanged: WhereAmI puts a cloud mark in front so the person sees ' +
  'where the thread runs. Say nothing about it. Later renames get the mark too.'

const PUSH_FIRST =
  'The person is moving this session to their own machine with `claude --teleport`, ' +
  'which needs the branch on GitHub. Now: commit all work in progress on the current ' +
  'branch (never on main; make a branch first if on main) and push it with ' +
  '`git push -u origin <branch>`. Open no pull request. Then tell them in one line ' +
  'which branch was pushed, and that they can run the command shown above on their machine.'

export const register: Register = (on, options) => {
  const root = typeof options.workspaceRoot === 'string' && options.workspaceRoot !== ''
    ? options.workspaceRoot
    : '$HOME/dev'
  const workspaces = typeof options.workspaces === 'string' ? options.workspaces : ''
  on('session.start', async ($, e, next) => {
    const p = await getPlace($)
    await $.command.register({
      name: 'whereami',
      description: 'Say where this session runs: your machine or a cloud container',
    })
    await $.command.register({
      name: 'go-local',
      description: 'Move this cloud session to your own machine: push the work, then the command to resume there',
    })
    $.ui.status(label(p))
    void $.ui.open({ id: PANE, title: 'Where am I' })
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const isThread = e.tools.some(isRenameThread)
    if (!isThread || !(await getPlace($)).isCloud) return composed
    return {
      sections: [
        ...composed.sections,
        { id: 'whereami:mark-title', text: MARK_TITLE, scope: 'session' },
      ],
    }
  })

  on('tool.call', async ($, e, next) => {
    if (!isRenameThread(e.tool) || !(await getPlace($)).isCloud) return next(e)
    const title: unknown = (e as { title?: unknown }).title
    if (typeof title !== 'string') return next(e)
    // The tool's input is the MCP server's, unknown here: only its title changes.
    const marked = { ...e, title: cloudTitle(title) } as typeof e
    return next(marked)
  })

  on('command.run', { command: 'whereami' }, async $ => {
    const p = await getPlace($)
    await $.ui.open({ id: PANE, title: 'Where am I' })
    const id = p.sessionId === null ? '' : `\nCloud session: ${p.sessionId}`
    return { text: `${label(p)}${id}` }
  })

  on('command.run', { command: 'go-local' }, async $ => {
    const p = await getPlace($)
    if (!p.isCloud) {
      return { text: `Nothing to move: this session already runs on ${p.machine}.` }
    }
    const repo = repoFromRemote((await $.session.repo())?.remote ?? null)
    if (repo === null) {
      return {
        text:
          'This session has no GitHub repository, so it can\'t be resumed elsewhere ' +
          'with its branch. In a terminal on your machine, run: claude --teleport',
      }
    }
    const folder = localFolder(repo, root, workspaces)
    const command = goLocalCommand(repo, folder, p.sessionId)
    if (command === null) {
      return {
        text:
          `The local folder set for ${repo.slug} ("${folder}") holds characters ` +
          'a shell would misread; fix it in the plugin\'s settings (whereami → Local checkouts).',
      }
    }
    return {
      text: [
        `To continue this session on your machine (${repo.slug}, folder ${folder}):`,
        '1. Claude now commits and pushes the work in progress.',
        '2. Then, in a terminal on your machine, paste:',
        '',
        `    ${command}`,
        '',
        'It clones the repository first if the folder has none, checks out this session\'s',
        'branch and brings the whole conversation along. The cloud copy stays as it was:',
        'new work happens on your machine. Run /remote-control there to keep steering',
        'it from your phone.',
      ].join('\n'),
      context: [PUSH_FIRST],
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const p = await getPlace($)
    const { Box, Button, Text } = $.ui.resolve(e)
    const color = p.isCloud ? '#b45309' : '#15803d'
    return (
      <Box flexDirection="column">
        <Box backgroundColor={color} paddingX={1}>
          <Text color="#ffffff" bold>
            {p.isCloud ? '☁ CLOUD' : '💻 LOCAL'}
          </Text>
        </Box>
        <Text>{p.isCloud ? `Container ${p.machine}` : `On ${p.machine}`}</Text>
        {p.isCloud ? (
          <Button
            key="go-local"
            label="Go local"
            onPress={() => $.prompt.fill({ text: '/go-local', mode: 'replace' })}
          />
        ) : null}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const p = await getPlace($)
    const { Box, Text } = $.ui.resolve(e)
    const color = p.isCloud ? '#b45309' : '#15803d'
    return (
      <Box backgroundColor={color} paddingX={1}>
        <Text color="#ffffff" bold>
          {label(p)}
        </Text>
        {p.isCloud ? <Text color="#ffffff"> · /go-local moves it to your machine</Text> : null}
      </Box>
    )
  })
}
