import { SWRConfig } from 'swr'
import { InotionApp } from './components/inotion/app'

export default function App() {
  return (
    <SWRConfig>
      <InotionApp />
    </SWRConfig>
  )
}
