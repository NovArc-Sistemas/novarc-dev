import type { ClientModule } from 'claude-code'

/** The band's first alert, pulsing: the dot dims and brightens on the surface's own clock (no hook redraw). */
const Pulse: ClientModule<{ label: string }, { t: number }> = (p, s) => {
  const { Box, Text } = s.elements
  const st = s.state ?? { t: 0 }
  if (!s.state) {
    s.setState(st)
    s.every(1200, () => s.setState({ t: ((s.state ?? st).t + 1) % 2 }))
  }
  return (
    <Box flexDirection="row" gap="sm">
      <Text dimColor={st.t === 1}>🔴</Text>
      <Text color="error" wrap="truncate-end">{p.label}</Text>
    </Box>
  )
}
export default Pulse
