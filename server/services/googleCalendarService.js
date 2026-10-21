const { randomUUID } = require('crypto');
const { google } = require('googleapis');

function localEventResult(startTime, endTime) {
  return {
    eventId: `local_${randomUUID()}`,
    googleMeetLink: null,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    isLiveSynced: false,
    status: 'local_only',
  };
}

function getCalendarClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return {
    calendar: google.calendar({ version: 'v3', auth: oauth2Client }),
    calendarId: GOOGLE_CALENDAR_ID || 'primary',
  };
}

async function createGoogleMeetEvent({ scheduledAt, durationMinutes = 45 }) {
  const startTime = new Date(scheduledAt);
  if (Number.isNaN(startTime.getTime()) || startTime <= new Date()) {
    throw new Error('A valid future meeting time is required.');
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
    throw new Error('Meeting duration must be between 1 and 480 minutes.');
  }

  const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);
  const client = getCalendarClient();
  if (!client) return localEventResult(startTime, endTime);

  try {
    const response = await client.calendar.events.insert({
      calendarId: client.calendarId,
      resource: {
        summary: 'Outreach consultation',
        description: 'Outreach consultation appointment.',
        start: { dateTime: startTime.toISOString(), timeZone: 'Africa/Johannesburg' },
        end: { dateTime: endTime.toISOString(), timeZone: 'Africa/Johannesburg' },
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
      conferenceDataVersion: 1,
    });

    const googleMeetLink = response.data.conferenceData?.entryPoints?.find(
      (entryPoint) => entryPoint.entryPointType === 'video'
    )?.uri;

    return {
      eventId: response.data.id || `local_${randomUUID()}`,
      googleMeetLink: googleMeetLink || null,
      startTime: response.data.start?.dateTime || startTime.toISOString(),
      endTime: response.data.end?.dateTime || endTime.toISOString(),
      isLiveSynced: true,
      status: 'synced',
    };
  } catch (error) {
    console.warn('Google Calendar sync failed; the meeting was recorded locally.');
    return { ...localEventResult(startTime, endTime), status: 'sync_failed' };
  }
}

async function updateGoogleMeetEvent({ eventId, scheduledAt, status, durationMinutes = 45 }) {
  if (!eventId || eventId.startsWith('local_')) return { status: 'local_only' };
  const client = getCalendarClient();
  if (!client) return { status: 'local_only' };

  try {
    if (status === 'cancelled') {
      await client.calendar.events.delete({ calendarId: client.calendarId, eventId });
    } else if (status === 'rescheduled') {
      const startTime = new Date(scheduledAt);
      if (Number.isNaN(startTime.getTime()) || startTime <= new Date()) {
        throw new Error('A valid future meeting time is required.');
      }
      const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);
      await client.calendar.events.patch({
        calendarId: client.calendarId,
        eventId,
        resource: {
          start: { dateTime: startTime.toISOString(), timeZone: 'Africa/Johannesburg' },
          end: { dateTime: endTime.toISOString(), timeZone: 'Africa/Johannesburg' },
        },
      });
    }
    return { status: 'synced' };
  } catch (error) {
    console.warn(`Google Calendar appointment update failed (${error.code || 'unknown'}); local appointment state was retained.`);
    return { status: 'sync_failed' };
  }
}

module.exports = { createGoogleMeetEvent, updateGoogleMeetEvent };
