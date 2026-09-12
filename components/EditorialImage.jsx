/** One responsive treatment for generated illustrations and credited photographs. */
export default function EditorialImage({ post, className = '', eager = false }) {
  if (!post?.image) return null;
  const img = <img className={className} src={post.image} alt={post.imageAlt || ''}
    width="1600" height="900" loading={eager ? 'eager' : 'lazy'} decoding="async" />;
  return post.imageAvif ? (
    <picture className="editorial-picture">
      <source type="image/avif" srcSet={post.imageAvif} />
      {img}
    </picture>
  ) : img;
}
