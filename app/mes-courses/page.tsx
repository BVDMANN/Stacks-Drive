import { redirect } from 'next/navigation';

/** Mes courses (v2.51) : l'écran s'appelle désormais « Activité »
 *  (/activite) — les anciens liens continuent de marcher via
 *  cette redirection. */
export default function MesCoursesPage() {
  redirect('/activite');
}
