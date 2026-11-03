import { useState } from 'react';
import { BadgeDollarSign, Bell, Check, Megaphone, Send } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';

function isUnread(message, userId) {
  return !(message.readBy || []).some((reader) => String(reader) === String(userId));
}

export default function Messages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const messagesQuery = useQuery({
    queryKey: ['workspace-messages'],
    queryFn: async () => (await API.get('/messages')).data,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  const messages = messagesQuery.data || [];
  const unreadCount = messages.filter((message) => isUnread(message, user?._id)).length;
  const isAdmin = user?.role === 'admin';

  async function publishAnnouncement(event) {
    event.preventDefault();
    setBusy(true);
    setNotice({ type: '', text: '' });
    try {
      const { data } = await API.post('/admin/announcements', { title, body });
      setNotice({ type: 'success', text: data.message });
      setTitle('');
      setBody('');
      await queryClient.invalidateQueries({ queryKey: ['workspace-messages'] });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Announcement could not be published.' });
    } finally {
      setBusy(false);
    }
  }

  async function markAsRead(message) {
    if (!isUnread(message, user?._id)) return;
    setNotice({ type: '', text: '' });
    try {
      await API.patch(`/messages/${message._id}/read`);
      await queryClient.invalidateQueries({ queryKey: ['workspace-messages'] });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Message could not be marked as read.' });
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6 p-2 sm:p-6">
      <header className="rounded-2xl bg-gradient-to-br from-slate-950 via-institute-deep to-institute-forest p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Workspace communications</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-3xl font-bold tracking-tight">Messages &amp; announcements</h1><p className="mt-2 max-w-2xl text-sm text-slate-200">Important platform updates and account-specific work notifications in one place.</p></div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm"><Bell size={15} />{unreadCount} unread</span>
        </div>
      </header>

      {notice.text && <p className={`rounded-lg border p-3 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</p>}

      {isAdmin && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4"><div className="rounded-lg bg-emerald-100 p-2 text-institute-forest"><Megaphone size={18} /></div><div><h2 className="font-bold text-slate-900">Publish a platform announcement</h2><p className="text-xs text-slate-600">This update will be available to every account in this workspace as soon as it is published.</p></div></header>
          <form className="space-y-4 p-5" onSubmit={publishAnnouncement}>
            <label className="block text-sm font-medium text-slate-700">Announcement title
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={180} onChange={(event) => setTitle(event.target.value)} required value={title} />
            </label>
            <label className="block text-sm font-medium text-slate-700">Message
              <textarea className="mt-1 min-h-32 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={10000} onChange={(event) => setBody(event.target.value)} required value={body} />
            </label>
            <button className="inline-flex items-center gap-2 rounded-lg bg-institute-forest px-4 py-2.5 text-sm font-semibold text-white hover:bg-institute-deep disabled:opacity-50" disabled={busy || !title.trim() || !body.trim()} type="submit"><Send size={15} />{busy ? 'Publishing…' : 'Publish to all accounts'}</button>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-5 py-4"><h2 className="font-bold text-slate-900">Your inbox</h2><p className="mt-1 text-sm text-slate-600">Announcements are shared across the workspace. Lead assignment updates are delivered to the specialists involved.</p></header>
        {messagesQuery.error ? (
          <div className="p-8 text-center text-sm text-rose-700" role="alert"><p>{messagesQuery.error.response?.data?.message || 'Messages could not be loaded.'}</p><button className="mt-2 underline" onClick={() => messagesQuery.refetch()} type="button">Retry</button></div>
        ) : messagesQuery.isLoading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading your inbox...</p>
        ) : messages.length === 0 ? (
          <div className="p-10 text-center"><Bell className="mx-auto text-slate-300" size={28} /><p className="mt-3 text-sm font-semibold text-slate-800">You’re all caught up</p><p className="mt-1 text-sm text-slate-500">New announcements and lead assignment updates will appear here.</p></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {messages.map((message) => {
              const unread = isUnread(message, user?._id);
              return (
                <article className={`p-5 ${unread ? 'bg-emerald-50/40' : 'bg-white'}`} key={message._id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className={`mt-0.5 rounded-lg p-2 ${message.type === 'announcement' ? 'bg-amber-100 text-amber-800' : message.type === 'payment_received' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{message.type === 'announcement' ? <Megaphone size={17} /> : message.type === 'payment_received' ? <BadgeDollarSign size={17} /> : <Bell size={17} />}</div>
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{message.title}</h3>{unread && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">New</span>}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{message.body}</p><p className="mt-2 text-xs text-slate-500">{message.type === 'announcement' ? 'Platform announcement' : message.type === 'payment_received' ? `Payment invoice${message.invoice?.invoiceNumber ? ` · ${message.invoice.invoiceNumber}` : ''}` : `Lead update${message.lead?.centerName || message.lead?.clientName ? ` · ${message.lead.centerName || message.lead.clientName}` : ''}`} · {message.createdBy?.name || 'Master Admin'} · {new Date(message.createdAt).toLocaleString('en-ZA')}</p></div>
                    </div>
                    {unread && <button className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 sm:ml-12" onClick={() => markAsRead(message)} type="button"><Check size={14} /> Mark read</button>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
