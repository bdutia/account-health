export type ChatRole = 'user' | 'model'

export interface ChatTurn {
  role: ChatRole
  text: string
  id: string
}

export interface StoredChatSession {
  token: string
  email: string
  name: string
}

export interface ChatGreetingResult {
  sessionId: string
  greeting: string
  dataSource: string
}

export interface ChatJobProgressEvent {
  type: 'progress' | 'completed' | 'failed'
  message?: string
  level?: 'info' | 'success' | 'warning'
  percent?: number
  result?: ChatGreetingResult
}
