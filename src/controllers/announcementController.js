const { Announcement, Employee } = require('../models/index.js');

async function listAnnouncements(req, res) {
  const rows = await Announcement.findAll({
    order: [['createdAt', 'DESC']],
    include: [{ model: Employee, attributes: ['id', 'name', 'role', 'department'] }],
  });
  res.json(rows);
}

async function createAnnouncement(req, res) {
  const { title, body, tag } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required.' });
  }

  const row = await Announcement.create({
    title,
    body,
    tag: tag || 'General',
    createdBy: req.user.id,
  });

  const announcementWithAuthor = await Announcement.findByPk(row.id, {
    include: [{ model: Employee, attributes: ['id', 'name', 'role', 'department'] }],
  });

  res.status(201).json(announcementWithAuthor);
}

async function updateAnnouncement(req, res) {
  const { id } = req.params;
  const { title, body, tag } = req.body;

  const announcement = await Announcement.findByPk(id, {
    include: [{ model: Employee, attributes: ['id', 'name', 'role', 'department'] }],
  });

  if (!announcement) {
    return res.status(404).json({ error: 'Announcement not found.' });
  }

  const userRole = req.user.role;
  const isCreatorHr = announcement.Employee?.role === 'hr' && announcement.createdBy === req.user.id;
  const isCreatorAdmin = announcement.Employee?.role === 'admin' && announcement.createdBy === req.user.id;
  const canEditAsHr = userRole === 'hr' && isCreatorHr;
  const canEditAsAdmin = userRole === 'admin' || userRole === 'superadmin';

  if (!canEditAsHr && !canEditAsAdmin) {
    return res.status(403).json({ error: 'You are not authorized to edit this announcement.' });
  }

  if (title) announcement.title = title;
  if (body) announcement.body = body;
  if (tag) announcement.tag = tag;
  await announcement.save();

  const updated = await Announcement.findByPk(id, {
    include: [{ model: Employee, attributes: ['id', 'name', 'role', 'department'] }],
  });

  res.json(updated);
}

module.exports = { listAnnouncements, createAnnouncement, updateAnnouncement };
