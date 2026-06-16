import { Module } from '@nestjs/common';

/** No BullMQ connection (e2e). */
@Module({})
export class QueueModuleWithoutBull {}
