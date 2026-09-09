/**
 * dsh-soul v2 (SoulFusion) — client settings section.
 *
 * Registers a "个性化" settings section (top-level, like dshmarket's Market
 * section) that edits the plugin config and saves it through the host HTTP
 * API /dsh-soul/config. Two-stage build (esbuild, externals resolved from
 * the loader module table at runtime): react/react-dom + ui-primitives `h`.
 */
import { useEffect, useState } from 'react'
import { h } from '@deepseek-ai/dsh-client-ui-primitives'

const STYLE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'default', label: '默认' },
  { id: 'professional', label: '专业严谨' },
  { id: 'friendly', label: '亲和友善' },
  { id: 'straight', label: '直言不讳' },
  { id: 'whimsical', label: '天马行空' },
  { id: 'pragmatic', label: '高效务实' },
  { id: 'roast', label: '毒舌吐槽' },
  { id: 'coaching', label: '启发引导' },
  { id: 'humorous', label: '幽默风趣' },
]

const LANG_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
]

interface ConfigShape {
  enabled: boolean
  nickname: string
  occupation: string
  bio: string
  style: string
  language: 'zh' | 'en'
  customInstructions: string
}

interface SoulClientCtx {
  on?(event: string, cb: () => void): () => void
}

export const name = 'dsh-soul'
export const inject = ['slots']
export function apply(ctx: SoulClientCtx): void {
  const { inject: slotsInject, register: slotsRegister } = (ctx as unknown as {
    slots: { inject(slot: string, register: () => unknown): void; register(meta: Record<string, unknown>, component: () => unknown): unknown }
  }).slots

  slotsInject('settings.section', () =>
    slotsRegister({ name: 'settings.section', id: 'soul', order: 60, label: () => '个性化' }, () =>
      h(SoulSection),
    ),
  )
}

function SoulSection(): ReturnType<typeof h> {
  const [form, setForm] = useState<ConfigShape | null>(null)
  const [status, setStatus] = useState<string>('')
  const [saving, setSaving] = useState<boolean>(false)

  useEffect(() => {
    let alive = true
    void fetch('/dsh-soul/config')
      .then(r => r.json())
      .then(body => {
        if (!alive) return
        if (body?.ok && body.config) {
          setForm({
            enabled: Boolean(body.config.enabled),
            nickname: String(body.config.nickname ?? ''),
            occupation: String(body.config.occupation ?? ''),
            bio: String(body.config.bio ?? ''),
            style: String(body.config.style ?? 'default'),
            language: body.config.language === 'en' ? 'en' : 'zh',
            customInstructions: String(body.config.customInstructions ?? ''),
          })
        } else {
          setStatus('配置读取失败：' + JSON.stringify(body).slice(0, 120))
        }
      })
      .catch(error => { if (alive) setStatus('读取失败：' + String(error)) })
    return () => { alive = false }
  }, [])

  const set = (patch: Partial<ConfigShape>): void => setForm(prev => (prev === null ? null : { ...prev, ...patch }))

  const save = (): void => {
    if (form === null) return
    setSaving(true)
    setStatus('')
    void fetch('/dsh-soul/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
      .then(async r => ({ status: r.status, body: await r.json() as { ok?: boolean; errors?: string[]; error?: string } }))
      .then(({ status, body }) => {
        setSaving(false)
        setStatus(status === 200 && body.ok ? '已保存，下一次回复生效。' : humanizeSaveError(body))
      })
      .catch(error => { setSaving(false); setStatus('保存失败：' + String(error)) })
  }

  const reset = (): void => {
    if (form === null) return
    setSaving(true)
    void fetch('/dsh-soul/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form, style: 'default', language: 'zh', nickname: '', occupation: '', bio: '', customInstructions: '' }),
    })
      .then(async r => ({ status: r.status, body: await r.json() as { ok?: boolean; errors?: string[]; error?: string; config?: unknown } }))
      .then(({ status, body }) => {
        setSaving(false)
        if (status === 200 && body.ok && body.config) {
          setForm({ enabled: true, nickname: '', occupation: '', bio: '', style: 'default', language: 'zh', customInstructions: '' })
          setStatus('已重置为默认。')
        } else setStatus('重置失败：' + humanizeSaveError(body))
      })
      .catch(error => { setSaving(false); setStatus('重置失败：' + String(error)) })
  }

  if (form === null) {
    return h('div', { style: { color: '#6b7280' } }, status !== '' ? status : '正在读取配置…')
  }

  const field = (label: string, children: ReturnType<typeof h>): ReturnType<typeof h> =>
    h('label', { style: { display: 'block', margin: '10px 0', fontSize: '13px', color: '#374151' } },
      h('div', { style: { marginBottom: '4px', fontWeight: 600 } }, label),
      children,
    )

  const inputStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }

  return h('div', { style: { maxWidth: '560px' } },
    h('div', { style: { marginBottom: '8px', fontSize: '14px', fontWeight: 600 } }, 'SoulFusion — dsh-soul v2 个性化'),
    field('回复风格', h('select', { value: form.style, onChange: (e: { target: { value: string } }) => set({ style: e.target.value }), style: inputStyle },
      STYLE_OPTIONS.map(opt => h('option', { key: opt.id, value: opt.id }, `${opt.label}（${opt.id}）`)),
    )),
    field('回复语言', h('select', { value: form.language, onChange: (e: { target: { value: 'zh' | 'en' } }) => set({ language: e.target.value }), style: inputStyle },
      LANG_OPTIONS.map(opt => h('option', { key: opt.id, value: opt.id }, opt.label)),
    )),
    field('昵称', h('input', { value: form.nickname, maxLength: 50, onChange: (e: { target: { value: string } }) => set({ nickname: e.target.value }), style: inputStyle, placeholder: '模型对你的称呼（可选）' })),
    field('职业', h('input', { value: form.occupation, maxLength: 50, onChange: (e: { target: { value: string } }) => set({ occupation: e.target.value }), style: inputStyle, placeholder: '可选' })),
    field('介绍', h('textarea', { value: form.bio, maxLength: 500, onChange: (e: { target: { value: string } }) => set({ bio: e.target.value }), style: { ...inputStyle, minHeight: '60px', resize: 'vertical' }, placeholder: '一句话介绍自己（可选）' })),
    field('自定义指令', h('textarea', { value: form.customInstructions, maxLength: 2000, onChange: (e: { target: { value: string } }) => set({ customInstructions: e.target.value }), style: { ...inputStyle, minHeight: '70px', resize: 'vertical' }, placeholder: '例如：回答先给结论再展开；用中文回复。' })),
    h('div', { style: { marginTop: '14px', display: 'flex', gap: '8px', alignItems: 'center' } },
      h('button', { type: 'button', disabled: saving, onClick: save, style: { padding: '6px 16px', borderRadius: '6px', border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: saving ? 'default' : 'pointer' } }, saving ? '保存中…' : '保存设置'),
      h('button', { type: 'button', disabled: saving, onClick: reset, style: { padding: '6px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', cursor: saving ? 'default' : 'pointer' } }, '重置为默认'),
      h('span', { style: { fontSize: '12px', color: status.startsWith('保存失败') || status.startsWith('读取失败') || status.startsWith('重置失败') ? '#b91c1c' : status !== '' ? '#0f6f4f' : '#6b7280' } }, status),
    ),
    h('div', { style: { marginTop: '10px', fontSize: '12px', color: '#9ca3af' } }, '风格、语言与指令随下一次回复生效；人设卡/记忆/审计面板在 MV3 加入。'),
  )
}

function humanizeSaveError(body: { errors?: string[]; error?: string }): string {
  const detail = body.errors?.join('；') ?? body.error ?? JSON.stringify(body).slice(0, 120)
  return '保存失败：' + detail
}
