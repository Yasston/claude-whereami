import { expect, mock, test } from 'claude-code/testing'

const COMPOSE = {
  model: 'm',
  promptModel: 'm',
  surfaces: [],
  outputStyle: { name: 'default', isKeepingCodingInstructions: true },
  traits: [],
} as const

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

const PANE = {
  plugin: 'whereami',
  component: 'Pane',
  requestId: 'whereami',
  props: {
    title: 'Where am I',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('the pane says LOCAL with no button on the laptop', async ($, on) => {
  mock.env(on, { HOSTNAME: 'my-laptop' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /LOCAL/ }))?.text).toContain('LOCAL')
    expect((await ui.find({ type: 'Text', text: /my-laptop/ }))?.text).toBe('On my-laptop')
    expect(await ui.find({ type: 'Button', key: 'go-local' })).toBeUndefined()
    await ui.unmount()
  }
})

test('in the cloud, the pane\'s Go local puts /go-local in the prompt box', async ($, on) => {
  mock.env(on, { HOSTNAME: 'runner-abc', CLAUDE_CODE_REMOTE: 'true' })
  const filled: string[] = []
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /CLOUD/ }))?.text).toContain('CLOUD')
    await ui.press({ key: 'go-local' })
    await ui.unmount()
  }
  expect(filled).toEqual(['/go-local', '/go-local'])
})

test('in the cloud, a thread title gets the cloud mark, once', async ($, on) => {
  mock.env(on, { HOSTNAME: 'runner-abc', CLAUDE_CODE_REMOTE: 'true' })
  const titles: string[] = []
  on('tool.call', (_, e) => {
    titles.push((e as { title?: string }).title ?? '')
    return { result: {} }
  })
  await $.tool.call({ tool: 'mcp__hearthbot__rename_thread', title: 'Fix Safari export' } as never)
  await $.tool.call({ tool: 'mcp__hearthbot__rename_thread', title: '☁ Fix Safari export' } as never)
  expect(titles).toEqual(['☁ Fix Safari export', '☁ Fix Safari export'])
})

test('on the laptop, thread titles stay as they are', async ($, on) => {
  mock.env(on, { HOSTNAME: 'my-laptop' })
  const titles: string[] = []
  on('tool.call', (_, e) => {
    titles.push((e as { title?: string }).title ?? '')
    return { result: {} }
  })
  await $.tool.call({ tool: 'mcp__hearthbot__rename_thread', title: 'Fix Safari export' } as never)
  expect(titles).toEqual(['Fix Safari export'])
})

test('in a cloud thread, the model is asked to mark it; outside a thread, not', async ($, on) => {
  mock.env(on, { CLAUDE_CODE_REMOTE: 'true', HOSTNAME: 'c' })
  on('prompt.compose', () => ({ sections: [] }))
  const { sections } = await $.prompt.compose({
    ...COMPOSE,
    tools: ['Bash', 'mcp__hearthbot__rename_thread'],
  })
  expect(sections.map(s => s.id)).toContain('whereami:mark-title')
  const solo = await $.prompt.compose({ ...COMPOSE, tools: ['Bash'] })
  expect(solo.sections).toEqual([])
})

test('on the laptop, the system prompt is left alone', async ($, on) => {
  mock.env(on, { HOSTNAME: 'my-laptop' })
  on('prompt.compose', () => ({ sections: [] }))
  const { sections } = await $.prompt.compose({
    ...COMPOSE,
    tools: ['mcp__hearthbot__rename_thread'],
  })
  expect(sections).toEqual([])
})
