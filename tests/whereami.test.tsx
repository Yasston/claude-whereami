import { expect, mock, test } from 'claude-code/testing'

const RUN = {
  command: 'go-local',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

const BAND = {
  plugin: 'whereami',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('on the laptop the band says LOCAL with the machine name', async ($, on) => {
  mock.env(on, { HOSTNAME: 'my-laptop' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const text = await ui.find({ type: 'Text', text: /LOCAL/ })
    expect(text?.text).toContain('my-laptop')
    await ui.unmount()
  }
})

test('in a cloud container the band says CLOUD', async ($, on) => {
  mock.env(on, { HOSTNAME: 'runner-abc', CLAUDE_CODE_REMOTE: 'true' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const text = await ui.find({ type: 'Text', text: /CLOUD/ })
    expect(text?.text).toContain('runner-abc')
    await ui.unmount()
  }
})

test('/go-local in the cloud gives the command and asks Claude to push', async ($, on) => {
  mock.env(on, {
    HOSTNAME: 'runner-abc',
    CLAUDE_CODE_REMOTE: 'true',
    CLAUDE_CODE_REMOTE_SESSION_ID: 'session_01ABC',
  })
  on('session.repo', () => ({
    value: {
      root: '/home/user/shop',
      remote: 'http://local_proxy@127.0.0.1:8080/git/acme/shop',
      internal: false,
      name: null,
    },
  }))
  const result = await $.command.run(RUN)
  expect(result.text).toContain(
    'D="$HOME/dev/shop"; [ -d "$D/.git" ] || git clone https://github.com/acme/shop.git "$D"; cd "$D" && claude --teleport session_01ABC',
  )
  expect(result.context?.[0]).toContain('push')
})

test('/go-local uses a listed checkout', { options: { workspaces: 'acme/shop=$HOME/work/rg' } }, async ($, on) => {
  mock.env(on, { CLAUDE_CODE_REMOTE: 'true', HOSTNAME: 'c' })
  on('session.repo', () => ({
    value: { root: '/r', remote: 'git@github.com:acme/shop.git', internal: false, name: null },
  }))
  const result = await $.command.run(RUN)
  expect(result.text).toContain('D="$HOME/work/rg"')
  expect(result.text).toContain('claude --teleport\n')
})

test('/go-local on the laptop has nothing to move', async ($, on) => {
  mock.env(on, { HOSTNAME: 'my-laptop' })
  const result = await $.command.run(RUN)
  expect(result.text).toContain('already runs on my-laptop')
  expect(result.context).toBeUndefined()
})
