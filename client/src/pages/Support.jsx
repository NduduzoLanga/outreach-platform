import { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, LifeBuoy, Plus, Send, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';

const CATEGORIES = ['Lead Issue', 'Payout / Withdrawal', 'Technical', 'General Query'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const EMPTY_FORM = {
  subject: '',
  category: 'General Query',
  priority: 'Medium',
  initialMessage: '',
};
const ticketSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required.'),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  initialMessage: z.string().trim().min(1, 'Message details are required.'),
});
const replySchema = z.object({ text: z.string().trim().min(1, 'Reply cannot be empty.') });
const PRIORITY_STYLES = {
  High: 'bg-rose-100 text-rose-800',
  Medium: 'bg-amber-100 text-amber-800',
  Low: 'bg-slate-100 text-slate-700',
};

function StatusIcon({ status }) {
  if (status === 'Resolved' || status === 'Closed') {
    return <CheckCircle2 aria-hidden="true" size={13} />;
  }
  if (status === 'In Progress') {
    return <Clock aria-hidden="true" size={13} />;
  }
  return <AlertCircle aria-hidden="true" size={13} />;
}

export default function Support() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const ticketQuery = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => (await API.get('/tickets')).data,
  });
  const tickets = ticketQuery.data || [];
  const selectedTicket = tickets.find((ticket) => ticket._id === selectedTicketId) || null;
  const ticketForm = useForm({
    resolver: zodResolver(ticketSchema),
    defaultValues: EMPTY_FORM,
  });
  const replyForm = useForm({
    resolver: zodResolver(replySchema),
    defaultValues: { text: '' },
  });

  const createTicket = useMutation({
    mutationFn: (values) => API.post('/tickets', values),
    onSuccess: async ({ data }) => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.setQueryData(['tickets'], (current = []) => [data, ...current.filter((ticket) => ticket._id !== data._id)]);
      setSelectedTicketId(data._id);
      setIsModalOpen(false);
      ticketForm.reset(EMPTY_FORM);
    },
    onError: (err) => setError(err.response?.data?.message || 'Failed to submit ticket.'),
  });
  const sendReply = useMutation({
    mutationFn: ({ ticketId, text }) => API.post(`/tickets/${ticketId}/reply`, { text }),
    onSuccess: async ({ data }) => {
      queryClient.setQueryData(['tickets'], (current = []) => [data, ...current.filter((ticket) => ticket._id !== data._id)]);
      setSelectedTicketId(data._id);
      replyForm.reset({ text: '' });
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (err) => setError(err.response?.data?.message || 'Failed to send reply.'),
  });

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-2 sm:p-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Support Desk</h1>
          <p className="text-sm text-slate-500">Log queries and track support response threads.</p>
        </div>
        <button
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-blue-700"
          onClick={() => { setError(''); ticketForm.reset(EMPTY_FORM); setIsModalOpen(true); }}
          type="button"
        >
          <Plus aria-hidden="true" size={18} />
          New Support Ticket
        </button>
      </header>

      {(error || ticketQuery.error) && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          <span>{error || ticketQuery.error?.response?.data?.message || 'Failed to load support tickets.'}</span>
          {ticketQuery.error && <button className="shrink-0 font-medium underline" onClick={() => ticketQuery.refetch()} type="button">Retry</button>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-1">
          <h2 className="border-b border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-800">
            My Tickets ({tickets.length})
          </h2>
          {ticketQuery.isLoading ? (
            <p className="p-6 text-center text-sm text-slate-500">Loading tickets...</p>
          ) : tickets.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No support tickets logged.</p>
          ) : (
            <div className="max-h-[600px] divide-y divide-slate-200 overflow-y-auto">
              {tickets.map((ticket) => (
                <button
                  aria-pressed={selectedTicket?._id === ticket._id}
                  className={`block w-full cursor-pointer p-4 text-left transition ${
                    selectedTicket?._id === ticket._id ? 'border-l-4 border-blue-600 bg-blue-50/80' : 'hover:bg-slate-50'
                  }`}
                  key={ticket._id}
                  onClick={() => setSelectedTicketId(ticket._id)}
                  type="button"
                >
                  <span className="mb-1 flex items-start justify-between gap-2">
                    <span className="line-clamp-1 text-sm font-semibold text-slate-800">{ticket.subject}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.Low}`}>
                      {ticket.priority}
                    </span>
                  </span>
                  <span className="mb-2 block text-xs text-slate-500">{ticket.category}</span>
                  <span className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1 font-semibold text-blue-600">
                      <StatusIcon status={ticket.status} />
                      {ticket.status}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flex min-h-[500px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          {selectedTicket ? (
            <>
              <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-4">
                <div>
                  <h2 className="font-bold text-slate-800">{selectedTicket.subject}</h2>
                  <p className="text-xs text-slate-500">Category: {selectedTicket.category}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <StatusIcon status={selectedTicket.status} />
                  {selectedTicket.status}
                </span>
              </header>
              <div aria-live="polite" className="max-h-[400px] flex-1 space-y-4 overflow-y-auto p-6">
                {selectedTicket.messages.map((message, index) => (
                  (() => {
                    const senderId = message.senderId?._id || message.senderId;
                    const isOwnMessage = senderId
                      ? String(senderId) === String(user?._id)
                      : user?.role === 'consultant' && message.sender === 'consultant';
                    const senderLabel = message.senderName
                      || message.senderRole
                      || (message.sender === 'support' ? 'Support' : message.sender);
                    return (
                      <div
                        className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
                        key={`${message.createdAt}-${index}`}
                      >
                        <div className={`max-w-md rounded-xl p-3.5 text-sm ${
                          isOwnMessage
                            ? 'rounded-br-none bg-blue-600 text-white'
                            : 'rounded-bl-none bg-slate-100 text-slate-800'
                        }`}>
                          <p className="whitespace-pre-wrap">{message.text}</p>
                        </div>
                        <span className="mt-1 text-[10px] text-slate-400">
                          {senderLabel} · {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })()
                ))}
              </div>
              <form className="flex gap-2 border-t border-slate-200 p-4" onSubmit={replyForm.handleSubmit((values) => {
                setError('');
                sendReply.mutate({ ticketId: selectedTicket._id, text: values.text });
              })}>
                <label className="sr-only" htmlFor="ticket-reply">Message reply</label>
                <input
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={replyForm.formState.isSubmitting || sendReply.isPending}
                  id="ticket-reply"
                  placeholder="Type your message reply..."
                  {...replyForm.register('text')}
                />
                <button
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                  disabled={replyForm.formState.isSubmitting || sendReply.isPending}
                  type="submit"
                >
                  <Send aria-hidden="true" size={16} />
                  {replyForm.formState.isSubmitting || sendReply.isPending ? 'Sending...' : 'Send'}
                </button>
              </form>
              {replyForm.formState.errors.text && <p className="px-4 pb-3 text-xs text-rose-600">{replyForm.formState.errors.text.message}</p>}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-slate-400">
              <LifeBuoy aria-hidden="true" className="mb-2 text-slate-300" size={48} />
              <p className="text-center text-sm">Select a ticket from the list to open the conversation thread.</p>
            </div>
          )}
        </section>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <section
            aria-labelledby="ticket-modal-title"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
            role="dialog"
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-800" id="ticket-modal-title">Log Support Ticket</h2>
              <button
                aria-label="Close dialog"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setIsModalOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </header>
            <form className="space-y-4 p-6" onSubmit={ticketForm.handleSubmit((values) => {
              setError('');
              createTicket.mutate(values);
            })}>
              <label className="block text-xs font-medium text-slate-700">
                Subject *
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  {...ticketForm.register('subject')}
                />
                {ticketForm.formState.errors.subject && <span className="mt-1 block text-rose-600">{ticketForm.formState.errors.subject.message}</span>}
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-xs font-medium text-slate-700">
                  Category
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    {...ticketForm.register('category')}
                  >
                    {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Priority
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    {...ticketForm.register('priority')}
                  >
                    {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-medium text-slate-700">
                Message Details *
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe your issue or query in detail..."
                  rows={4}
                  {...ticketForm.register('initialMessage')}
                />
                {ticketForm.formState.errors.initialMessage && <span className="mt-1 block text-rose-600">{ticketForm.formState.errors.initialMessage.message}</span>}
              </label>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  disabled={ticketForm.formState.isSubmitting || createTicket.isPending}
                  onClick={() => setIsModalOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  disabled={ticketForm.formState.isSubmitting || createTicket.isPending}
                  type="submit"
                >
                  {ticketForm.formState.isSubmitting || createTicket.isPending ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
