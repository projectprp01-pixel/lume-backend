import OpenAI from 'openai';
import Booking from '../../models/Booking.model.js';
import Guest from '../../models/Guest.model.js';
import Notification from '../../models/Notification.model.js';
import ServiceRequest from '../../models/ServiceRequest.model.js';
import { OPENAI_API_KEY } from '../../config/env.js';

const getOpenAI = () => new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * AI Chat — sends message to OpenAI and detects service requests
 */
export const chatWithConcierge = async (req, res) => {
  try {
    const { message, guestId, conversationHistory = [], existingRequestId } = req.body;
    if (!message || !guestId) {
      return res.status(400).json({ success: false, message: 'message and guestId are required' });
    }

    const systemPrompt = `You are Eva, an AI concierge for Lume Resort, a luxury property in Coorg, India. Be warm, helpful, and professional in a luxury hospitality tone.

When a guest makes a service request (room service, housekeeping, maintenance, extra amenities, transport, dietary needs, special arrangements, etc.), respond helpfully AND append a JSON block at the very end of your response wrapped in <REQUEST> tags like this:

<REQUEST>
{"item":"brief item name","category":"Room Essentials|Maintenance|Room Service|Guest Services|Special Requests|Transport|Other","department":"Housekeeping|Maintenance|F&B Services|Guest Services|Front Office|Security","priority":"Normal|High","aiSummary":"one sentence summary of what needs to be done","actionables":["step 1","step 2"]}
</REQUEST>

Only include the <REQUEST> block for actual service requests. For general questions, recommendations, itinerary help, or greetings, do NOT include it.`;

    const messages = [
      ...conversationHistory.slice(-10).map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.content
      })),
      { role: 'user', content: message }
    ];

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 500,
      temperature: 0.7
    });

    const rawResponse = completion.choices[0].message.content || '';

    // Extract <REQUEST> block if present
    const requestMatch = rawResponse.match(/<REQUEST>([\s\S]*?)<\/REQUEST>/);
    let createdRequest = null;
    let updatedRequest = null;
    let responseText = rawResponse.replace(/<REQUEST>[\s\S]*?<\/REQUEST>/g, '').trim();

    if (requestMatch) {
      try {
        const requestData = JSON.parse(requestMatch[1].trim());

        if (existingRequestId) {
          // Update the existing request instead of creating a new one
          updatedRequest = await ServiceRequest.findByIdAndUpdate(
            existingRequestId,
            {
              ...requestData,
              guestComment: message, // overwrite with latest message
            },
            { new: true }
          );
        } else {
          // First request in this conversation — create it
          const guest = await Guest.findById(guestId);
          const booking = await Booking.findOne({ guestId }).sort({ createdAt: -1 }).lean();
          const slaDue = new Date(Date.now() + 60 * 60 * 1000);

          createdRequest = await ServiceRequest.create({
            ...requestData,
            guestId,
            guestName: guest?.fullName || '',
            guestComment: message,
            source: 'Chat',
            propertyId: booking?.propertyId || 'default',
            slaDue
          });

          await Notification.create({
            guestId,
            title: 'Request Received',
            message: `Your request for "${requestData.item}" has been received and will be handled by our ${requestData.department} team shortly.`,
            type: 'info',
            relatedId: createdRequest._id.toString(),
            relatedType: 'request'
          });
        }
      } catch (parseErr) {
        console.error('Failed to parse/create/update service request:', parseErr);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        response: responseText,
        requestCreated: !!createdRequest,
        requestUpdated: !!updatedRequest,
        request: createdRequest || updatedRequest
      }
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ success: false, message: 'Chat service unavailable', error: error.message });
  }
};
