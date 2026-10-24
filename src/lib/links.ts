/** 방 링크: 현재 주소에서 쿼리만 바꾼다 (?r=방id) */
export function roomUrl(href: string, roomId: string) {
  const url = new URL(href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('r', roomId)
  return url.toString()
}

export function roomIdFrom(href: string) {
  const id = new URL(href).searchParams.get('r')
  return id && /^[a-z0-9]{4,16}$/.test(id) ? id : null
}
