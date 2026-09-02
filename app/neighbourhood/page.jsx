import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import NeighbourhoodChat from '../../components/NeighbourhoodChat.jsx';

export const metadata = {
  title: 'Neighbourhood tracker — what has actually been announced | Truestorey',
  description: 'Live retrieval on any Singapore estate, town or project, with every claim linked to its source. Free, no sign-up.',
  alternates: { canonical: '/neighbourhood' },
};

export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Neighbourhood tracker"
        sub="Ask about a town, an estate or a project and get what has actually been published, with the links. Free, and nothing is saved." />
      <ToolIntro href="/neighbourhood" />
      <ToolUse id="neighbourhood" />
      <section className="pane"><NeighbourhoodChat /></section>
      <section className="pane">
        <div className="note">
          <b>It links reporting, it does not reproduce it.</b> Answers carry the source and the date
          and stop there. If the only thing available is somebody&rsquo;s article, you get the link
          to read it yourself — this site has never republished another publication&rsquo;s work and
          this tool does not either.
        </div>
        <div className="note">
          <b>Open the sources.</b> Retrieval finds what is indexed, which is not the same as what is
          true, and the date on a page is not always the date of the thing it describes. Every claim
          here is checkable in one click, which is the point of showing them.
        </div>
        <div className="note">
          <b>The numbers live elsewhere on this site.</b> Prices, floor premiums, yields and supply
          all come from filed transactions in the datasets, not from a search. This tool is for what
          has been <em>announced</em>; the tools below are for what has been <em>transacted</em>.
        </div>
        <ul className="idx" style={{ marginTop: 16 }}>
          <li><Link href="/blindspot"><span className="n">Four checks on a specific property</span><span className="s">A published rubric over filed data</span></Link></li>
          <li><Link href="/archive"><span className="n">Policy and data archive</span><span className="s">Primary sources, indexed and linked</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
