import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination } from "swiper/modules";
import { JarvisAiBanner } from "@/components/leverx/JarvisAiBanner";
import { PromoBanner } from "@/components/leverx/PromoBanner";
import { cn } from "@/lib/utils";

import "swiper/css";
import "swiper/css/pagination";

type Props = {
  className?: string;
};

export function MarketsPromoBanners({ className }: Props) {
  return (
    <div className={cn("markets-promo-banners", className)}>
      <div className="markets-promo-banners-grid hidden md:grid md:grid-cols-2 md:gap-3">
        <PromoBanner className="h-full" />
        <JarvisAiBanner className="h-full" />
      </div>

      <Swiper
        className="markets-promo-swiper md:hidden"
        modules={[Pagination]}
        slidesPerView={1.2}
        spaceBetween={12}
        pagination={{ clickable: true }}
      >
        <SwiperSlide className="markets-promo-slide">
          <PromoBanner className="h-full" />
        </SwiperSlide>
        <SwiperSlide className="markets-promo-slide">
          <JarvisAiBanner className="h-full" />
        </SwiperSlide>
      </Swiper>
    </div>
  );
}
