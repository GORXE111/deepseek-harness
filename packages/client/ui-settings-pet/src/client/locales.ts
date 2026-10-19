/** `settings.pet` namespace dictionaries (the desktop companion row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: '桌面陪伴助手',
  companion: '由谁陪着',
  nickname: '它怎么称呼你',
  placeholder: '比如 老大、主人',
  hint: '别的智能体干完活时，她会用这个称呼提醒你。留空就不称呼。离开输入框或按回车时保存。',
} satisfies Record<string, string>

/** The settings.pet namespace key union. */
export type PetKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  title: 'Desktop companion',
  companion: 'Companion',
  nickname: 'What it calls you',
  placeholder: 'e.g. boss',
  hint: 'She uses this when another agent finishes a task. Leave empty for no name. Saves on blur or Enter.',
} satisfies Record<PetKey, string>
