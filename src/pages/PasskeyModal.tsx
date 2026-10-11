import { useState } from "react"
import { Fingerprint, ShieldCheck, X, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PasskeyModal({ onClose }: { onClose: (dontAskAgain?: boolean) => void }) {
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const close = () => onClose(dontAskAgain)
  return <div className="passkey-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close() }}><section className="passkey-modal" role="dialog" aria-modal="true" aria-labelledby="passkey-title"><button className="passkey-close" type="button" aria-label="Close passkey prompt" onClick={close}><X /></button><div className="passkey-icon"><Fingerprint /></div><p className="eyebrow"><span>Secure your account</span></p><h2 id="passkey-title">Enable Passkey for Login</h2><p className="passkey-intro">Sign in faster and more securely without remembering another password.</p><div className="passkey-benefits"><div><span><Fingerprint /></span><p><strong>No passwords needed</strong><small>Sign in with Face ID, fingerprint, or PIN.</small></p></div><div><span><ShieldCheck /></span><p><strong>More secure</strong><small>Passkeys add an extra layer of protection to your account.</small></p></div><div><span><Zap /></span><p><strong>Faster access</strong><small>Enjoy quick, seamless logins every time.</small></p></div></div><label className="passkey-check"><input type="checkbox" checked={dontAskAgain} onChange={(event) => setDontAskAgain(event.target.checked)} /> <span>Don’t ask again</span></label><div className="passkey-actions"><Button variant="outline" type="button" onClick={close}>Not now</Button><Button type="button" onClick={close}>Enable</Button></div></section></div>
}
