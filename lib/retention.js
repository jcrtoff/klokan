const { prisma } = require('./db');

const RETENTION_MONTHS = 24;

async function runRetention() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);

  const expiredSessions = await prisma.session.findMany({
    where: {
      lastActivity: { lt: cutoff }
    },
    select: { id: true, leadProfile: true }
  });

  let anonymized = 0;
  let deleted = 0;

  for (const session of expiredSessions) {
    const profile = (typeof session.leadProfile === 'object' && session.leadProfile) ? session.leadProfile : {};

    // Anonymize: null out PII, keep aggregate fields
    const anonymizedProfile = {
      name: null,
      email: null,
      phone: null,
      budget: profile.budget || null,
      propertyType: profile.propertyType || null,
      neighbourhood: profile.neighbourhood || null,
      projectType: profile.projectType || null,
      timeline: profile.timeline || null,
      leadScore: profile.leadScore || null,
      preApproval: null,
      notes: null
    };

    // Delete messages and consent records
    await prisma.message.deleteMany({ where: { sessionId: session.id } });
    await prisma.consent.deleteMany({ where: { sessionId: session.id } });

    // Anonymize the profile and mark as archived
    await prisma.session.update({
      where: { id: session.id },
      data: {
        leadProfile: anonymizedProfile,
        archivedAt: new Date()
      }
    });

    anonymized++;
  }

  console.log(`Retention: ${anonymized} sessions anonymized, ${deleted} deleted`);
  return { anonymized, deleted, cutoffDate: cutoff.toISOString() };
}

module.exports = { runRetention };
