'use client'

import { useState, type FormEvent } from 'react'
import {
  ArrowUp,
  Check,
  MessageCircleMore,
  Mic,
  Paperclip,
  Sparkles,
} from 'lucide-react'
import type { Transaction } from '@/domain/models'
import type { Interpretation } from '@/lib/interpret'
import { formatEuro } from '@/lib/finance'

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  proposal?: Transaction
  saved?: boolean
}

const suggestions = [
  'Recebi 2.500 € de um cliente',
  'Paguei 180 € de combustível',
  'Quanto gastei este mês?',
]
const categories = [
  'Clientes',
  'Deslocações',
  'Equipamento',
  'Software',
  'Instalações',
  'Refeições',
  'Fornecedores',
  'Equipa',
  'Outros',
]

export function ChatPanel({
  onInterpret,
  onConfirm,
}: {
  onInterpret: (message: string) => Interpretation
  onConfirm: (transaction: Transaction) => void
}) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])

  function send(value: string) {
    const text = value.trim()
    if (!text) return
    const result = onInterpret(text)
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', text },
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: result.reply,
        proposal: result.kind === 'proposal' ? result.transaction : undefined,
      },
    ])
    setInput('')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    send(input)
  }
  function confirm(message: Message) {
    if (!message.proposal) return
    onConfirm({
      ...message.proposal,
      accountingStatus: 'needs_review',
      updatedAt: new Date().toISOString(),
    })
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, saved: true } : item,
      ),
    )
  }
  function changeCategory(id: string, category: string) {
    setMessages((current) =>
      current.map((item) =>
        item.id === id && item.proposal
          ? { ...item, proposal: { ...item.proposal, category } }
          : item,
      ),
    )
  }

  return (
    <section className="chat-panel" id="chat">
      <div className="chat-top">
        <div className="chat-avatar">
          <Sparkles size={20} />
        </div>
        <div>
          <h2>Personal CFO</h2>
          <p>O teu espaço para pôr tudo em ordem</p>
        </div>
        <span className="chat-available">
          <i /> A postos
        </span>
      </div>
      <div className="chat-content" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-symbol">
              <MessageCircleMore size={23} />
            </div>
            <span className="eyebrow">VAMOS COMEÇAR?</span>
            <h3>Conta-me o que aconteceu.</h3>
            <p>
              Uma compra, um pagamento ou uma dúvida. Escreve como falarias com
              alguém da tua equipa.
            </p>
            <div className="suggestion-list">
              {suggestions.map((suggestion) => (
                <button key={suggestion} onClick={() => send(suggestion)}>
                  {suggestion} <ArrowUp size={14} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message) => (
              <div className={`chat-message ${message.role}`} key={message.id}>
                {message.role === 'assistant' && (
                  <div className="message-avatar">
                    <Sparkles size={13} />
                  </div>
                )}
                <div className="message-body">
                  <p>{message.text}</p>
                  {message.proposal && (
                    <div className="proposal-card">
                      <div className="proposal-header">
                        <span>PROPOSTA DE REGISTO</span>
                        <span>
                          Confiança{' '}
                          {Math.round(message.proposal.confidence * 100)}%
                        </span>
                      </div>
                      <div className="proposal-line">
                        <span>Valor</span>
                        <strong>{formatEuro(message.proposal.amount)}</strong>
                      </div>
                      <div className="proposal-line">
                        <span>Tipo</span>
                        <strong>
                          {message.proposal.type === 'income'
                            ? 'Entrada'
                            : 'Saída'}
                        </strong>
                      </div>
                      <label className="proposal-line">
                        <span>Categoria sugerida</span>
                        <select
                          disabled={message.saved}
                          value={message.proposal.category}
                          onChange={(event) =>
                            changeCategory(message.id, event.target.value)
                          }
                        >
                          {categories.map((category) => (
                            <option key={category}>{category}</option>
                          ))}
                        </select>
                      </label>
                      <div className="proposal-footer">
                        <span>Documento por associar · sujeito a revisão</span>
                        <button
                          disabled={message.saved}
                          onClick={() => confirm(message)}
                        >
                          {message.saved ? (
                            <>
                              <Check size={15} /> Guardado
                            </>
                          ) : (
                            <>
                              Confirmar registo <ArrowUp size={15} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <label htmlFor="chat-input">A tua mensagem</label>
        <div className="composer-field">
          <textarea
            id="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send(input)
              }
            }}
            placeholder="Ex.: Paguei 320 € por um computador para a empresa..."
            rows={2}
          />
          <div className="composer-actions">
            <div>
              <button
                type="button"
                disabled
                title="Anexos disponíveis numa versão futura"
                aria-label="Anexar documento (brevemente)"
              >
                <Paperclip size={18} />
              </button>
              <button
                type="button"
                disabled
                title="Voz disponível numa versão futura"
                aria-label="Usar voz (brevemente)"
              >
                <Mic size={18} />
              </button>
            </div>
            <button
              className="send-button"
              type="submit"
              disabled={!input.trim()}
              aria-label="Enviar mensagem"
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </div>
        <p>
          As sugestões precisam da tua confirmação. Questões fiscais devem ser
          revistas pelo contabilista.
        </p>
      </form>
    </section>
  )
}
