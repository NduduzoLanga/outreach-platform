import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';

const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(60, 'First name must be 60 characters or fewer.'),
  lastName: z.string().trim().min(1, 'Last name is required.').max(60, 'Last name must be 60 characters or fewer.'),
  phone: z.string().trim().max(32).regex(/^[+()\d\s.-]*$/, 'Use a valid phone number format.'),
  calendlyUrl: z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter a complete Calendly link beginning with https://.'),
  accountHolder: z.string().trim(),
  bankName: z.string().trim(),
  accountNumber: z.string().trim().max(40).regex(/^[\d\s-]*$/, 'Use digits only for the account number.'),
  branchCode: z.string().trim().max(20).regex(/^[\d\s-]*$/, 'Use digits only for the branch code.'),
  password: z.union([z.literal(''), z.string().min(12, 'Password must be at least 12 characters.').max(72, 'Password must be 72 characters or fewer.')]),
});

export default function Profile() {
  const { user, setUser } = useAuth();
  const [message, setMessage] = useState({ type: '', text: '' });
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      calendlyUrl: '',
      accountHolder: '',
      bankName: '',
      accountNumber: '',
      branchCode: '',
      password: '',
    },
  });

  useEffect(() => {
    reset({
      firstName: user?.firstName || user?.name?.trim().split(/\s+/)[0] || '',
      lastName: user?.lastName || user?.name?.trim().split(/\s+/).slice(1).join(' ') || '',
      phone: user?.phone || '',
      calendlyUrl: user?.calendlyUrl || '',
      accountHolder: user?.bankDetails?.accountHolder || '',
      bankName: user?.bankDetails?.bankName || '',
      accountNumber: user?.bankDetails?.accountNumber || '',
      branchCode: user?.bankDetails?.branchCode || '',
      password: '',
    });
  }, [user, reset]);

  const updateProfile = useMutation({
    mutationFn: async (form) => {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        calendlyUrl: form.calendlyUrl,
        bankDetails: {
          accountHolder: form.accountHolder,
          bankName: form.bankName,
          accountNumber: form.accountNumber,
          branchCode: form.branchCode,
        },
      };
      if (form.password) payload.password = form.password;
      return API.put('/auth/profile', payload);
    },
    onSuccess: ({ data }) => {
      setUser(data);
      setMessage({ type: 'success', text: 'Profile updated successfully.' });
    },
    onError: (error) => {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to save profile changes.',
      });
    },
  });
  const formValues = watch();
  const isConsultant = user?.role === 'consultant';
  const roleLabel = user?.role === 'specialist' ? 'Lead specialist' : user?.role === 'admin' ? 'Master administrator' : 'Outreach consultant';
  const completionFields = [formValues.firstName, formValues.lastName, user?.email, formValues.phone];
  if (isConsultant) completionFields.push(formValues.bankName, formValues.accountNumber);
  if (user?.role === 'specialist') completionFields.push(formValues.calendlyUrl);
  const profileCompletion = Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100);

  return (
    <section className="mx-auto max-w-3xl space-y-6 p-2 sm:p-6">
      <header className="rounded-2xl bg-gradient-to-br from-slate-950 via-institute-deep to-institute-forest p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Account settings</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-3xl font-bold tracking-tight">Your profile</h1><p className="mt-2 text-sm text-slate-200">{roleLabel} · {user?.email}</p></div>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold capitalize">{(user?.accountStatus || 'active').replaceAll('_', ' ')}</span>
        </div>
        <div className="mt-5 max-w-md">
          <div className="flex justify-between text-xs text-slate-200"><span>Profile readiness</span><span>{profileCompletion}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-institute-gold transition-all" style={{ width: `${profileCompletion}%` }} /></div>
        </div>
      </header>

      {message.text && (
        <p
          className={`rounded-lg border p-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
          role={message.type === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}

      <form className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit((values) => updateProfile.mutate(values))}>
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-slate-800">Personal details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              First name
              <input
                autoComplete="given-name"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                maxLength={60}
                {...register('firstName')}
              />
              {errors.firstName && <span className="mt-1 block text-xs text-rose-600">{errors.firstName.message}</span>}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Last name
              <input
                autoComplete="family-name"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                maxLength={60}
                {...register('lastName')}
              />
              {errors.lastName && <span className="mt-1 block text-xs text-rose-600">{errors.lastName.message}</span>}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-500" readOnly value={user?.email || ''} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Phone
              <input
                autoComplete="tel"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                {...register('phone')}
              />
            </label>
          </div>
        </fieldset>

        {(user?.role === 'specialist' || user?.role === 'consultant') && (
          <fieldset className="space-y-4 border-t border-slate-200 pt-5">
            <legend className="text-lg font-semibold text-slate-800">Scheduling preferences</legend>
            <p className="text-sm text-slate-500">Add your Calendly booking page so clients can easily choose a time with you.</p>
            <label className="block text-sm font-medium text-slate-700">
              Calendly booking link
              <input
                autoComplete="url"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                maxLength={2048}
                placeholder="https://calendly.com/your-name"
                {...register('calendlyUrl')}
              />
              {errors.calendlyUrl && <span className="mt-1 block text-xs text-rose-600">{errors.calendlyUrl.message}</span>}
            </label>
          </fieldset>
        )}

        {isConsultant && <fieldset className="space-y-4 border-t border-slate-200 pt-5">
          <legend className="text-lg font-semibold text-slate-800">Payout bank details</legend>
          <p className="text-sm text-slate-500">Required to submit a withdrawal request. Details are snapshotted when you request a payout.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Account holder
              <input
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                {...register('accountHolder')}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Bank name
              <input
                autoComplete="organization"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                {...register('bankName')}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Account number
              <input
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                {...register('accountNumber')}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Branch code
              <input
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                {...register('branchCode')}
              />
            </label>
          </div>
        </fieldset>}

        <fieldset className="space-y-3 border-t border-slate-200 pt-5">
          <legend className="text-lg font-semibold text-slate-800">Change password</legend>
          <label className="block text-sm font-medium text-slate-700">
            New password
            <input
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 sm:max-w-md"
              placeholder="Leave blank to keep your current password"
              type="password"
              maxLength={72}
              {...register('password')}
            />
            {errors.password && <span className="mt-1 block text-xs text-rose-600">{errors.password.message}</span>}
          </label>
        </fieldset>

        <div className="flex justify-end border-t border-slate-200 pt-5">
          <button
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={isSubmitting || updateProfile.isPending}
            type="submit"
          >
            {isSubmitting || updateProfile.isPending ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </form>
    </section>
  );
}
