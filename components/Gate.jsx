'use client';
import LeadForm from './LeadForm.jsx';

/** The ask. Context is the record the visitor was looking at, when there is one. */
export default function Gate({ context = null }) {
  return <LeadForm context={context} />;
}
